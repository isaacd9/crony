'use strict';

const awsApi = require('aws-sdk');

awsApi.config.apiVersions = {
  ecs: '2014-11-13'
}

const defaultOptions = {
  api: {
    region: 'us-west-2',
    sslEnabled: true,
  },
  cluster: {
    clusterName: 'crony'
  },
  image: {
    Filters: [{
      Name: 'name',
      Values: [
        'amzn-ami-2016.09.f-amazon-ecs-optimized'
      ]
    }]
  },
  instance: {
    InstanceType: 't2.nano',
    MaxCount: 1,
    MinCount: 1
  }
};

const defaultTaskOptions = {
  containerDefinitions: [
    {
      logConfiguration: {
        logDriver: 'awslogs'
      }
    }
  ]
};

class aws {
  constructor(options) {
    this.options = defaultOptions;
    Object.assign(this.options, options);

    this._api = new awsApi.ECS(this.options.api);
    this._ec2 = new awsApi.EC2(this.options.api);
  }

  _createCluster() {
    return this._api.createCluster(this.options.cluster).promise();
  }

  _getAMIId() {
    // Use the user specified image if there is one
    if ('ImageId' in this.options.instance) {
      return;
    }

    // Otherwise, figure out what the proper imageId is
    return this._ec2.describeImages(this.options.image)
      .promise()
      .then(result => {
        this.options.instance.ImageId = result.Images[0].ImageId;
      });
  }

  _createContainerInstances() {
    let ud = `#!/bin/bash\n\
    echo ECS_CLUSTER=${this.options.cluster.clusterName}>> /etc/ecs/ecs.config`;

    this.options.instance.UserData = ud;
    return this._ec2.runInstances(this.options.instance)
      .promise();
  }

  _imageToFamily(image) {
    return image.replace(/\//, '_').toLowerCase();
  }

  _createTask(options) {
    return this._api.registerTaskDefinition(options).promise();
  }

  _runTask(createResult) {
    let arn = createResult.taskDefinitionArn;
    this._runningTasks = this._runningTasks || [];
    this._runningTasks.push(arn);

    return this._api.runTask({
      taskDefinition: arn,
      cluster: this.options.clusterName,
      startedBy: 'crony'
    });
  }

  setupCluster(clusterOptions, imageOptions, instanceOptions) {
    Object.assign(this.options.cluster, clusterOptions);
    Object.assign(this.options.image, imageOptions);
    Object.assign(this.options.instance, instanceOptions);

    return this._createCluster()
      .then(this._getAMIId.bind(this))
      .then(this._createContainerInstances.bind(this))
      .then(result => {
        this._runningInstances = this._runningInstances || [];
        this._runningInstances = this._runningInstances
          .concat(result.instancesSet);
      })
  }

  scheduleContainer(image, options) {
    let taskOptions = defaultTaskOptions;

    if (typeof image === 'string') {
      let containerOptions = options || {};
      containerOptions.image = image;
      taskOptions.family = this._imageToFamily(image);

      Object.assign(taskOptions.containerDefinitions[0], containerOptions);
    } else {
      Object.assign(taskOptions.containerDefinitions[0], image);
      taskOptions.family = this._imageToFamily(image.image);
    }

    return this._createTask(taskOptions)
      .then(this._runTask.bind(this));
  }

  teardownCluster() {
    this._api.deleteCluster({
      cluster: this.options.cluster.clusterName
    }).promise();
  }
}

module.exports = aws;

