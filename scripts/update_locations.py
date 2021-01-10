#!/usr/bin/env python
import argparse
import boto3
from datetime import datetime
from haversine import haversine, Unit
import logging
import math
import requests
import threading
import time


location = boto3.client('location')


def get_distance_between_coords(a, b):
  return haversine((a[1], a[0]), (b[1], b[0]), unit=Unit.METERS)


def get_devices(endpoint_url, api_key):
  headers = {}
  if api_key:
    headers = {'X-API-Key': api_key}

  return requests.get(endpoint_url + '/devices', headers=headers).json()


def update_device_position(id, lng, lat, tracker_name):
  return location.batch_update_device_position(
    TrackerName=tracker_name,
    Updates=[
      {
        'DeviceId': id,
        'Position': [lng, lat],
        'SampleTime': datetime.utcnow()
      }
    ]
  )


def process_device(device, speed, interval, tracker_name):
  logging.info("Thread for device '{}' is starting".format(device['DeviceId']))

  # Calculate all the steps first, then just move the device along the steps.
  steps = []

  for i in range(len(device['Path']) - 1):
    a = device['Path'][i]
    b = device['Path'][i + 1]

    distance = get_distance_between_coords(a, b)
    n_segments = math.floor(distance / (speed * interval))

    for j in range(n_segments):
      lng = a[0] + (b[0] - a[0]) / n_segments * j
      lat = a[1] + (b[1] - a[1]) / n_segments * j

      steps.append((lng, lat))

  logging.info("Device '{}' has a path made of {} steps".format(device['DeviceId'], len(steps)))

  while True:
    for (lng, lat) in steps:
      logging.info("Updating device '{}' at location ({}, {})".format(device['DeviceId'], lng, lat))
      update_device_position(device['DeviceId'], lng, lat, tracker_name)
      time.sleep(interval)

    logging.info("Device '{}' has completed one lap".format(device['DeviceId']))


def main(tracker_name, endpoint_url, api_key, speed, interval):
  logging.info(" > Tracker: {}".format(tracker_name))
  logging.info(" > Endpoint URL: {}".format(endpoint_url))
  logging.info(" > API key: {}".format(api_key))
  logging.info(" > Speed: {} m/s".format(speed))
  logging.info(" > Interval: {} seconds".format(interval))

  devices = get_devices(endpoint_url, api_key)

  for device in devices:
    t = threading.Thread(target=process_device, args=(device, speed, interval, tracker_name))
    t.start()


if __name__ == '__main__':
  format = "%(asctime)s: %(message)s"
  logging.basicConfig(format=format, level=logging.INFO)
  parser = argparse.ArgumentParser(description='Update the location of devices.')
  parser.add_argument('--tracker-name',
                      required=True,
                      help='The name of the Amazon Location Service tracker.')
  parser.add_argument('--endpoint-url',
                      help='The URL of the API endpoint (defaults to http://localhost:3000).',
                      default='http://localhost:3000')
  parser.add_argument('--api-key',
                      help='The API key used to authenticate requests to the API')
  parser.add_argument('--interval',
                      type=int,
                      help='How much time (in seconds) to wait between updates (defaults to 2).',
                      default=2)
  parser.add_argument('--speed',
                      type=int,
                      help='The speed (in m/s) at which all devices move around the map (defaults to 25)',
                      default=25)

  args = parser.parse_args()
  main(args.tracker_name, args.endpoint_url, args.api_key, args.speed, args.interval)
