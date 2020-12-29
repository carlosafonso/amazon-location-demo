import boto3
import datetime
import json


DEVICE_ID = 'TestDevice'
GEOFENCE_COLLECTION_NAME = 'MyGeofenceCollection'
TRACKER_NAME = 'MyTracker'

location_client = boto3.client('location')


def default_json_serializer(o):
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()


def build_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body, default=default_json_serializer)
    }


def build_success(body):
    return build_response(200, body)


def build_not_found(msg):
    return build_response(404, {"error": msg})


def build_server_error(e):
    return build_response(500, {"error": str(e)})


def api_action(fn):
    def wrapper(event, context):
        try:
            return fn(event, context)
        except Exception as e:
            return build_server_error(e)
    return wrapper


@api_action
def get_geofences(event, context):
    response = location_client.list_geofences(
        CollectionName=GEOFENCE_COLLECTION_NAME
    )
    return build_success(response['Entries'])


@api_action
def create_geofence(event, context):
    # To-Do: Validation:
    #   - Valid JSON
    #   - At least 4 points with correct format
    #   - Counter-clockwise (?)
    body = json.loads(event['body'])

    points = body['Points']
    if points[0] != points[-1]:
        points.append(points[0])

    response = location_client.put_geofence(
        CollectionName=GEOFENCE_COLLECTION_NAME,
        GeofenceId=body['Id'],
        Geometry={
            'Polygon': [points]
        }
    )
    del response['ResponseMetadata']
    return build_success(response)


@api_action
def delete_geofence(event, context):
    id = event['pathParameters']['id']
    response = location_client.batch_delete_geofence(
        CollectionName=GEOFENCE_COLLECTION_NAME,
        GeofenceIds=[id]
    )

    if len(response['Errors']):
        if response['Errors'][0]['Error']['Code'] == 'ResourceNotFoundError':
            return build_not_found(response['Errors'][0]['Error']['Message'])
        return build_server_error(response['Errors'][0]['Error']['Message'])

    del response['ResponseMetadata']
    return build_success(response)


@api_action
def get_device_position(event, context):
    response = location_client.get_device_position(
        DeviceId=DEVICE_ID,
        TrackerName=TRACKER_NAME
    )
    del response['ResponseMetadata']
    return build_success(response)
