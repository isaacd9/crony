import test from 'ava';

const mockAWS = require('aws-sdk-mock');
const aws = require('aws-sdk');

const Aws = require('../lib/aws.js');

test.beforeEach(t => {
  t.context.ecs = new Aws();
});

test('ECS constructed properly', t => {
  let ecs = new Aws();

  t.is(ecs._api.endpoint.host, 'ecs.us-west-2.amazonaws.com');
});

test('Can set ECS options from CLI', t => {
  let ecs = new Aws({
    api: {
      region: 'us-east-1'
    }
  });

  t.is(ecs._api.endpoint.host, 'ecs.us-east-1.amazonaws.com');
});

test('Can create a cluster and tear it down', t => {
  let ecs = t.context.ecs;
  let clusterName = 'crony';
  let imageName = 'amzn-ami-2016.09.f-amazon-ecs-optimized';
  let imageId = 'ami-022b9262';
  let instanceDef = {
    instancesSet: [{
      amiOrWhatever: '1234'
    }]
  };

  mockAWS.mock('EC2', 'describeImages', (params, callback) => {
    t.is(params.Filters[0].Values[0], imageName);
    callback(null, {
      Images: [
        {
          ImageId: imageId
        }
      ]
    });
  });

  mockAWS.mock('EC2', 'runInstances', (params, callback) => {
    t.is(params.ImageId, imageName);
    callback(null, instanceDef);
  });

  mockAWS.mock('ECS', 'createCluster', (params, callback) => {
    t.is(params.clusterName, clusterName);
    callback(null, 'cluster created');
  });

  mockAWS.mock('ECS', 'deleteCluster', (params, callback) => {
    t.is(params.cluster, clusterName);
    callback(null, 'Cluster deleted');
  });

  ecs._api = new aws.ECS(ecs.options.api);
  ecs._ec2 = new aws.EC2(ecs.options.api);

  ecs.setupCluster();

  clusterName = 'not_crony';
  ecs.setupCluster({
    clusterName: 'not_crony'
  });


  ecs.teardownCluster();
});

test('Can create a task and schedule a container', t => {
  let ecs = t.context.ecs;
  let imageName = 'Hello/World';

  mockAWS.mock('ECS', 'registerTaskDefinition', (params, callback) => {
    t.is(params.family, ecs._imageToFamily(imageName));

    callback(null, {
      taskDefinitionArn: 'fakeArn'
    });
  });

  mockAWS.mock('ECS', 'runTask', (params, callback) => {
    callback(null, 'Task running');
  });

  ecs._api = new aws.ECS(ecs.options.api);
  ecs._ec2 = new aws.EC2(ecs.options.api);

  ecs.scheduleContainer(imageName);
  ecs.scheduleContainer({
    image: imageName
  });
});

