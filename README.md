# Amazon Location Service demo

This project intends to showcase some features of the newly-launched AWS product, Amazon Location Service.

The demo is made up of three parts:

1. An API.
2. A web app.
3. A companion script that updates device locations, as if these devices were actually moving around a map.

## Requirements

### Dependencies

You will need the following utilities to be able to run this demo:

* Docker > v20.10.0.
* Python >= v3.8.
* NodeJS >= v14 and NPM >= v6.
* AWS CLI >= v2.1.14 (with a valid set of AWS credentials).
* AWS SAM CLI >= v1.15.0.

This project might work with previous versions of the above dependencies, but it has not been tested with them.

In addition, you need to have several NPM packages installed globally:

```
# Install the Gulp CLI
npm i -g gulp-cli
```

### Amazon Location Service resources

At the time that this demo was developed, AWS CloudFormation did not yet support the required Amazon Location Service resources for a fully unattended deployment, so for the time being these need to be created by hand.

Run the following commands, replacing everything between angle brackets with your values (including the brackets themselves):

```
# Create a map
aws location create-map \
    --map-name "<YOUR_MAP_NAME>" \
    --configuration "Style=VectorEsriNavigation" \
    --pricing-plan "RequestBasedUsage"

# Create a geofence collection
aws location create-geofence-collection \
    --collection-name "<YOUR_GEOFENCE_COLLECTION_NAME>" \
    --pricing-plan "RequestBasedUsage"

# Create a tracker
aws location create-tracker \
    --tracker-name "<YOUR_TRACKER_NAME>" \
    --pricing-plan "RequestBasedUsage"

# Associate the tracker with the geofence collection (the ARN of the geofence
# collection was returned when you created the collection in earlier steps)
aws location associate-tracker-consumer \
    --tracker-name "<YOUR_TRACKER_NAME>" \
    --consumer-arn "<ARN_OF_YOUR_GEOFENCE_COLLECTION>"
```

## Deployment

### API

The following steps will create all API-related components in the AWS account of your choice. You can inspect the contents of `api/template.yaml` to see what will be created. Note that some charges might be accrued in your AWS account after this action.

From the `api` folder run the following:

```
# Build the project
sam build --use-container

# Deploy it
sam deploy --guided
```

You'll need to answer some questions to the last command, after which a CloudFormation stack will be created. Remember that the values of the `GeofenceCollectionName` and `TrackerName` parameters correspond to the names of the Amazon Location Service geofence collection and tracker, respectively, that you created in the Requirements section above.

The stack will output two values, `ApiEndpoint` and `IdentityPoolId`. Write these down as you'll need them later.

### Web app

First, install all NPM dependencies from the `www` folder:

```
cd www/
npm i
```

Now copy `config.json.dist` to `config.json` and replace the values within it to the appropriate ones:

* `apiEndpoint` should be the API Gateway endpoint URL (you can retrieve it as an output from the CloudFormation stack).
* `cognitoIdentityPoolId`: should be the ID of the Cognito Identity Pool (also from the CloudFormation stack).
* `mapName`: the name of your map in Amazon Location Service.

Run this to start the web server:

```
gulp
npx serve ./dist
```

The web app will be available at http://localhost:5000.

### Scripts

Run this to have the device locations continuously updated:

```
./scripts/update_locations.py
```

For info on the available parameters, use this:

```
./scripts/update_locations.py -h
```

## Local development

There's a Docker Compose file at the root of the project which will start DynamoDB Local.

```
docker-compose start
```

Recreate the table:

```
aws --endpoint-url http://host.docker.internal:8000 dynamodb delete-table --table-name Devices

aws --endpoint-url http://host.docker.internal:8000 dynamodb create-table \
    --table-name Devices \
    --attribute-definitions AttributeName=DeviceId,AttributeType=S \
    --key-schema AttributeName=DeviceId,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

(The endpoint URL of `http://host.docker.internal:8000` is appropriate when the AWS CLI itself runs as a Docker container. If you have the AWS CLI installed locally in your machine, you probably want to use `http://localhost:8000` instead.)

Now get into the `api` folder, copy `api/envvars.json.dist` into `api/envvars.json`, and set the appropriate environment variable values.

To build:

```
sam build --use-container --cached
```

To run locally:

```
sam build --use-container && \
    sam local start-api \
        -n ./envvars.json \
        --parameter-overrides "GeofenceCollectionName=<YOUR_GEOFENCE_COLLECTION_NAME>" "TrackerName=<YOUR_TRACKER_NAME>" \
        --warm-containers LAZY
```
