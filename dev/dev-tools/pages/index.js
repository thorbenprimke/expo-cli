import * as React from 'react';
import gql from 'graphql-tag';
import { Query } from 'react-apollo';

import * as Constants from 'app/common/constants';
import * as Strings from 'app/common/strings';
import * as Data from 'app/common/data';
import * as State from 'app/common/state';
import { initStore } from 'app/common/store';

import withRedux from 'app/higher-order/withRedux';
import withApollo from 'app/higher-order/withApollo';

import Root from 'app/components/Root';
import ProjectManager from 'app/components/ProjectManager';

const query = gql`
  query IndexPageQuery {
    currentProject {
      projectDir
      manifestUrl
      settings {
        hostType
      }
      config {
        name
        description
        slug
      }
      sources {
        __typename
        id
        name
        messages {
          count
          nodes {
            id
            __typename
            msg
            time
          }
        }
      }
      messages {
        pageInfo {
          lastCursor
        }
      }
    }
    userSettings {
      sendTo
    }
    projectManagerLayout {
      __typename
      selected {
        id
      }
      sources {
        id
      }
    }
  }
`;

const subscriptionQuery = gql`
  subscription MessageSubscription($after: String!) {
    messages(after: $after) {
      type
      node {
        id
        __typename
        msg
        time
        source {
          id
        }
      }
    }
  }
`;

@withRedux(initStore, state => state)
class IndexPageContents extends React.Component {
  _handleDeviceSelect = options => State.sourceSelect(options, this.props);
  _handleSectionDrag = options => State.sourceSwap(options, this.props);
  _handleSectionSelect = options => State.sectionSelect(options, this.props);
  _handleSectionDismiss = () => State.sectionClear(this.props);
  _handleChangeSectionCount = count => State.sectionCount({ count }, this.props);
  _handleUpdateState = options => State.update(options, this.props);
  _handleSimulatorClickIOS = () => State.openSimulator('ios', this.props);
  _handleSimulatorClickAndroid = () => State.openSimulator('android', this.props);
  _handleHostTypeClick = hostType => State.setProjectSettings({ hostType }, this.props);
  _handleSubmitPhoneNumberOrEmail = () => State.sendProjectUrl(this.props.recipient, this.props);
  _handlePublishProject = () => State.publishProject(this.props);

  componentDidMount() {
    const observable = this.props.client.subscribe({
      query: subscriptionQuery,
      variables: {
        after: this.props.data.currentProject.messages.pageInfo.lastCursor,
      },
    });
    this.querySubscription = observable.subscribe({
      next: result => this.updateCurrentData(result),
      // error: this.updateError,
    });
  }

  componentWillUnmount() {
    if (this.querySubscription) {
      this.querySubscription.unsubscribe();
    }
  }

  updateCurrentData(result) {
    if (result.data.messages.type === 'ADDED') {
      this.addNewMessage(result.data.messages.node);
    }
  }

  addNewMessage(message) {
    const typename = message.source.__typename;
    const fragment = gql`
      fragment ${typename}Fragment on ${typename} {
        __typename
        id
        messages {
          __typename
          count
          nodes {
            id
            __typename
            msg
            time
          }
        }
      }
    `;
    const id = `Source:${message.source.id}`;
    let existingSource;
    try {
      existingSource = this.props.client.readFragment({ id, fragment });
    } catch (e) {
      // XXX(@fson): refetching all data
      this.props.refetch();
      return;
    }
    const newMessages = {
      __typename: 'MessageConnection',
      count: existingSource.messages.count + 1,
      nodes: [...existingSource.messages.nodes, message],
    };
    this.props.client.writeFragment({
      id,
      fragment,
      data: {
        id,
        __typename: typename,
        messages: newMessages,
      },
    });
  }

  render() {
    const { data: { currentProject, projectManagerLayout }, loading, error } = this.props;

    const sources = currentProject.sources.filter(source => {
      return source.__typename !== 'Issues' || source.messages.count > 0;
    });
    const sections = projectManagerLayout.sources
      .map(({ id }) => sources.find(source => source.id === id))
      .filter(section => section);
    const count = projectManagerLayout.sources.length;
    const selectedId = projectManagerLayout.selected && projectManagerLayout.selected.id;

    return (
      <Root>
        <ProjectManager
          loading={loading}
          error={error}
          project={currentProject}
          renderableSections={sections}
          sections={sources}
          count={count}
          userAddress={this.props.userAddress}
          selectedId={selectedId}
          isPublishing={this.props.isPublishing}
          isActiveDeviceAndroid={this.props.isActiveDeviceAndroid}
          isActiveDeviceIOS={this.props.isActiveDeviceIOS}
          onPublishProject={this._handlePublishProject}
          onHostTypeClick={this._handleHostTypeClick}
          onSimulatorClickIOS={this._handleSimulatorClickIOS}
          onSimulatorClickAndroid={this._handleSimulatorClickAndroid}
          onSectionDrag={this._handleSectionDrag}
          onSectionDismiss={this._handleSectionDismiss}
          onSectionSelect={this._handleSectionSelect}
          onSubmitPhoneNumberOrEmail={this._handleSubmitPhoneNumberOrEmail}
          onChangeSectionCount={this._handleChangeSectionCount}
          onDeviceSelect={this._handleDeviceSelect}
          onUpdateState={this._handleUpdateState}
        />
      </Root>
    );
  }
}

@withApollo
export default class IndexPage extends React.Component {
  render() {
    return (
      <Query query={query}>
        {result => {
          if (!result.loading && !result.error) {
            return <IndexPageContents {...result} />;
          } else {
            // TODO(freiksenet): fix loading states
            return null;
          }
        }}
      </Query>
    );
  }
}