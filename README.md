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

## Deployment

### API

The following steps will create all API-related components in the AWS account of your choice. You can inspect the contents of `api/template.yaml` to see what will be created. Note that some charges might be accrued in your AWS account after this action.

From the `api` folder run the following:

```
# Build the project
sam build --use-container --cached

# Deploy it
sam deploy --guided
```

You'll need to answer some questions to the last command, after which a CloudFormation stack will be created. Among these, you'll be asked to provide values for the following parameters:

* `NotificationEmailAddress`: an email address that will receive alerts when a device enters or exits a geofence.

The stack will output two values, `ApiEndpoint` and `IdentityPoolId`. Write these down as you'll need them later.

The stack will also create an API key to provide a minimal layer of authentication. The value of this can be obtained using the AWS CLI or the API Gateway management console.

### Web app

First, install all NPM dependencies from the `www` folder:

```
cd www/
npm i
```

Now copy `config.json.dist` to `config.json` and replace the values within it to the appropriate ones:

* `apiEndpoint`: the API Gateway endpoint URL (you can retrieve it as an output from the CloudFormation stack).
* `apiKey`: the API key to authenticate your requests.
* `cognitoIdentityPoolId`: the ID of the Cognito Identity Pool (also from the CloudFormation stack).
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

## How to use

1. With the API running, visit the website.
2. Click on the **Geofence** button in the left sidebar, under _Edit mode_.
3. Draw a polygon in the map.
4. Enter a name in the **Geofence ID** text box and hit Enter or click the button next to the box.
5. Then click on **Device** under _Edit mode_.
6. Draw a path that will be followed by this device. Make sure that the path crosses the geofence boundaries at least once (otherwise no events will be triggered by Amazon Location Service).
7. Enter a name for the device in the **Device ID** text box and hit Enter.
8. Then run the `update_locations.py` script. This script will periodically update the position of the device, moving it along the defined path.

Whenever the device enters or exits the geofence, you will receive an SNS notification at the email address that you specified earlier.

You can also look for Points of Interest (POIs) by typing in the **POI Search** text box and pressing Enter.

## Local development

There's a Docker Compose file at the root of the project which will start DynamoDB Local.

```
docker-compose start
```

Recreate the table:

```
aws --endpoint-url http://localhost:8000 dynamodb delete-table --table-name Devices

aws --endpoint-url http://localhost:8000 dynamodb create-table \
    --table-name Devices \
    --attribute-definitions AttributeName=DeviceId,AttributeType=S \
    --key-schema AttributeName=DeviceId,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

(If you are running the AWS CLI as a Docker container, you might want to use `http://host.docker.internal:8000` as the endpoint URL instead of `http://localhost:8000`.)

Now get into the `api` folder, copy `api/envvars.json.dist` into `api/envvars.json`, and set the appropriate environment variable values.

To build:

```
sam build --use-container --cached
```

To run locally:

```
sam build --use-container --cached && \
    sam local start-api \
        -n ./envvars.json \
        --parameter-overrides \
            "GeofenceCollectionName=<YOUR_GEOFENCE_COLLECTION_NAME>" \
            "TrackerName=<YOUR_TRACKER_NAME>" \
            "PlaceIndexName=<YOUR_PLACES_INDEX_NAME>" \
            "RouteCalculatorName=<YOUR_ROUTE_CALCULATOR_NAME>" \
            "NotificationEmailAddress=<YOUR_EMAIL_ADDRESS>" \
        --warm-containers LAZY
```
