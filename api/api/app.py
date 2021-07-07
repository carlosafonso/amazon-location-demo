import botocore
import boto3
import datetime
import decimal
import json
import os


class DeviceRepository(object):
    def __init__(self, ddb_resource, table_name):
        self._ddb = ddb_resource
        self._devices_table = ddb_resource.Table(table_name)

    def _serialize_decimals(self, obj):
        """This is a hacky way to work around Boto3's requirement that numbers
        are represented as Decimal().

        From: https://github.com/boto/boto3/issues/369
        """
        if isinstance(obj, list):
            return [self._serialize_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._serialize_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, decimal.Decimal):
            if obj % 1 == 0:
                return int(obj)
            else:
                return float(obj)
        else:
            return obj

    def _deserialize_decimals(self, obj):
        """And this is the reverse operation. If a float type is found, convert
        it into Decimal() so Boto3 can work with it.
        """
        if isinstance(obj, list):
            return [self._deserialize_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._deserialize_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, float):
            # https://stackoverflow.com/a/52450303
            with decimal.localcontext(boto3.dynamodb.types.DYNAMODB_CONTEXT) as ctx:
                ctx.traps[decimal.Inexact] = False
                ctx.traps[decimal.Rounded] = False
                return ctx.create_decimal_from_float(obj)
            return decimal.Decimal(obj)
        else:
            return obj

    def get_devices(self):
        return self._serialize_decimals(self._devices_table.scan()['Items'])

    def create_device(self, device):
        return self._devices_table.put_item(Item=self._deserialize_decimals(device))

    def delete_device(self, id):
        self._devices_table.delete_item(Key={'DeviceId': id})
        return True


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


def build_bad_request(msg):
    return build_response(400, {"error": msg})


def build_not_found(msg):
    return build_response(404, {"error": msg})


def build_server_error(e):
    return build_response(500, {"error": str(e)})


def api_action(fn):
    def wrapper(event, context):
        try:
            return fn(event, context)
        except Exception as e:
            # Replace this with proper logging.
            print(str(e))
            return build_server_error(e)
    return wrapper


AWS_ENDPOINT = None
if 'AWS_SAM_LOCAL' in os.environ:
    AWS_ENDPOINT = 'http://host.docker.internal:8000'

GEOFENCE_COLLECTION_NAME = os.environ['ALS_DEMO_GEOFENCE_COLLECTION_NAME']
TRACKER_NAME = os.environ['ALS_DEMO_TRACKER_NAME']
PLACE_INDEX_NAME = os.environ['ALS_DEMO_PLACE_INDEX_NAME']
ROUTE_CALCULATOR_NAME = os.environ['ALS_DEMO_ROUTE_CALCULATOR_NAME']
DDB_TABLE_NAME = os.environ['ALS_DEMO_DDB_TABLE_NAME']

location_client = boto3.client('location')
ddb_resource = boto3.resource('dynamodb', endpoint_url=AWS_ENDPOINT)
device_repo = DeviceRepository(ddb_resource=ddb_resource, table_name=DDB_TABLE_NAME)


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
def get_devices(event, context):
    data = device_repo.get_devices()
    return build_success(data)


@api_action
def create_device(event, context):
    body = json.loads(event['body'])
    device_repo.create_device(body)
    return build_success({'status': 'ok'})


@api_action
def delete_device(event, context):
    id = event['pathParameters']['id']
    device_repo.delete_device(id)
    return build_success({'status': 'ok'})


@api_action
def get_device_position(event, context):
    try:
        id = event['pathParameters']['id']
        response = location_client.get_device_position(
            DeviceId=id,
            TrackerName=TRACKER_NAME
        )
        del response['ResponseMetadata']
        return build_success(response)
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            return build_not_found(e.response['Error']['Message'])
        raise


@api_action
def search_pois(event, context):
    if not event['queryStringParameters'] or 'term' not in event['queryStringParameters']:
        return build_bad_request("Missing query string parameter 'term'")

    term = event['queryStringParameters']['term'].strip()
    if not len(term):
        return build_bad_request("Missing query string parameter 'term'")

    response = location_client.search_place_index_for_text(
        IndexName=PLACE_INDEX_NAME,
        Text=term
    )

    return build_success(response['Results'])

@api_action
def get_route(event, context):
    if (
        not event['queryStringParameters']
        or 'from' not in event['queryStringParameters']
        or 'to' not in event['queryStringParameters']
    ):
        return build_bad_request("Missing query string parameters 'from' or 'to'")

    route_from = event['queryStringParameters']['from'].strip()
    route_to = event['queryStringParameters']['to'].strip()

    if not len(route_from) or not len(route_to):
        return build_bad_request("Missing query string parameters 'from' or 'to'")

    response = location_client.calculate_route(
        CalculatorName=ROUTE_CALCULATOR_NAME,
        DeparturePosition=list(map(float, route_from.split(','))),
        DestinationPosition=list(map(float, route_to.split(','))),
        IncludeLegGeometry=True
    )

    return build_success(response['Legs'])
