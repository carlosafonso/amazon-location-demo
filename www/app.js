const { Signer } = window.aws_amplify_core;

class ApiService {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  /**
   * Wrapper around WindowOrWorkerGlobalScope.fetch() that includes the API key
   * headers.
   */
  _fetch(url, data) {
    if (data === undefined) {
      data = {};
    }

    if (!data.hasOwnProperty('headers')) {
      data.headers = {};
    }

    data.headers['X-API-Key'] = this.apiKey;

    return fetch(url, data);
  }

  getGeofences() {
    return this._fetch(`${this.endpoint}/geofences`).then(response => response.json());
  }

  createGeofence(id, coordinates) {
    return this._fetch(
      `${this.endpoint}/geofences`,
      {
        method: 'POST',
        body: JSON.stringify({Id: id, Points: coordinates})
      }
    ).then(response => response.json());
  }

  deleteGeofence(id) {
    return this._fetch(
      `${this.endpoint}/geofences/${id}`,
      {method: 'DELETE'}
    ).then(response => response.json());
  }

  getDevices() {
    return this._fetch(`${this.endpoint}/devices`).then(response => response.json());
  }

  createDevice(id, coordinates) {
    return this._fetch(
      `${this.endpoint}/devices`,
      {
        method: 'POST',
        body: JSON.stringify({DeviceId: id, Path: coordinates})
      }
    ).then(response => response.json());
  }

  deleteDevice(id) {
    return this._fetch(
      `${this.endpoint}/devices/${id}`,
      {method: 'DELETE'}
    ).then(response => response.json());
  }

  getDevicePosition(id) {
    return this._fetch(`${this.endpoint}/devices/${id}/position`).then(response => response.json());
  }

  searchPois(term) {
    return this._fetch(`${this.endpoint}/pois?term=${term}`).then(response => response.json());
  }
}

class App {
  constructor(apiService) {
    this.devices = [];

    this.map = null;
    this.mode = 'default';
    this.newGeofenceCoords = null;
    this.newDeviceCoords = null;
    this.apiService = apiService;

    this.markers = {};
    this.poiMarker = null;

    this.geofencesData = {type: 'FeatureCollection', features: []};
    this.devicesData = {type: 'FeatureCollection', features: []};

    this.searchPoisForm = document.getElementById('search-pois-form');
    this.searchPoisTermTextBox = document.getElementById('pois-search-term');
    this.toggleDefaultModeBtn = document.getElementById('toggle-default-mode-btn');
    this.toggleGeofenceCreationModeBtn = document.getElementById('toggle-geofence-creation-mode-btn');
    this.toggleDeviceCreationModeBtn = document.getElementById('toggle-device-creation-mode-btn');
    this.createGeofenceForm = document.getElementById('create-geofence-form');
    this.createDeviceForm = document.getElementById('create-device-form')
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingText = document.getElementById('loading-text');
    this.newGeofenceIdTextBox = document.getElementById('new-geofence-id');
    this.newDeviceIdTextBox = document.getElementById('new-device-id');

    // Instantiate a Cognito-backed credential provider
    this.awsCredentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: COGNITO_IDENTITY_POOL_ID,
    });
  }

  async _getGeofences() {
    let geofences = await this.apiService.getGeofences();

    this.geofencesData = {type: 'FeatureCollection', features: []};

    // Draw geofence polygons
    geofences.forEach((geofence) => {
      this.geofencesData.features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: geofence.Geometry.Polygon
        },
        properties: {
          id: geofence.GeofenceId
        }
      });
    });
    this.map.getSource('geofences').setData(this.geofencesData);
  }

  _createGeofence() {
    if (this.mode !== 'createGeofence') {
      throw 'Not in createGeofence mode';
    }

    if (this.newGeofenceCoords === null || this.newGeofenceCoords.length < 4) {
      throw 'Not enough coordinates in geofence';
    }

    let geofenceId = this.newGeofenceIdTextBox.value.trim();
    if (!geofenceId.length) {
      throw 'Geofence ID has not been provided';
    }

    this.showLoadingOverlay('Creating geofence...');
    return this.apiService
      .createGeofence(geofenceId, this.newGeofenceCoords)
      .then(d => this._getGeofences())
      .finally(d => {
        // Clear geofence ID text box
        this.newGeofenceIdTextBox.value = '';

        // Clear coordinate array
        this.newGeofenceCoords = null;

        // Clear map layer and source
        this.map.getSource('_newGeofence').setData(null);

        // Reset mode
        this.toggleDefaultMode();

        this.hideLoadingOverlay();
      });
  }

  _deleteGeofence(id) {
    this.showLoadingOverlay('Deleting geofence...');
    return this.apiService.deleteGeofence(id)
      .then(d => this._getGeofences())
      .then(d => this.hideLoadingOverlay());
  }

  async _getDevices() {
    this.devices = await this.apiService.getDevices();

    this.devicesData = {type: 'FeatureCollection', features: []};

    // Draw device features
    this.devices.forEach((device) => {
      this.devicesData.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: device.Path
        },
        properties: {
          id: device.DeviceId
        }
      });
    });
    this.map.getSource('devices').setData(this.devicesData);
  }

  _createDevice() {
    if (this.mode !== 'createDevice') {
      throw 'Not in createDevice mode';
    }

    let deviceId = this.newDeviceIdTextBox.value.trim();
    if (!deviceId.length) {
      throw 'Device ID has not been provided';
    }

    this.showLoadingOverlay('Creating device...');
    return this.apiService
      .createDevice(deviceId, this.newDeviceCoords)
      .then(d => this._getDevices())
      .finally(d => {
        // Clear device ID text box
        this.newDeviceIdTextBox.value = '';

        // Clear coordinate array
        this.newDeviceCoords = null;

        // Clear map layer and source
        this.map.getSource('_newDevice').setData(null);

        // Reset mode
        this.toggleDefaultMode();

        this.hideLoadingOverlay();
      });
  }

  _deleteDevice(id) {
    this.showLoadingOverlay('Deleting device...');
    return this.apiService.deleteDevice(id)
      .then(d => {
        // Remove device and related marker from map and app state
        this.devices = this.devices.filter(device => device.DeviceId !== id);
        if (this.markers[id] !== undefined) {
          this.markers[id].remove();
          delete this.markers[id];
        }
      })
      .then(d => this._getDevices())
      .then(d => this.hideLoadingOverlay());
  }

  _searchPois() {
    const term = this.searchPoisTermTextBox.value.trim();
    if (!term.length) {
      throw 'Search term has not been provided';
    }

    this.showLoadingOverlay('Searching POIs...');
    return this.apiService.searchPois(term)
      .then(results => {
        // Remove the previous marker
        if (this.poiMarker !== null) {
          this.poiMarker.remove();
          this.poiMarker = null;
        }

        // Add new marker if there's at least one result
        if (results.length) {
          let marker = new mapboxgl.Marker({color: '#00ff00'})
            .setLngLat(results[0].Place.Geometry.Point)
            .addTo(this.map);
          this.poiMarker = marker;
        } else {
          console.info('POI search yielded no results.');
        }
      })
      .finally(d => this.hideLoadingOverlay());
  }

  _transformRequest(url, resourceType) {
    if (resourceType === "Style" && !url.includes("://")) {
      // resolve to an AWS URL
      url = `https://maps.geo.${AWS.config.region}.amazonaws.com/maps/v0/maps/${url}/style-descriptor`;
    }

    if (url.includes("amazonaws.com")) {
      // only sign AWS requests (with the signature as part of the query string)
      return {
        url: Signer.signUrl(url, {
          access_key: this.awsCredentials.accessKeyId,
          secret_key: this.awsCredentials.secretAccessKey,
          session_token: this.awsCredentials.sessionToken,
        }),
      };
    }

    // don't sign
    return { url };
  }

  async _updateDevicePositions(interval) {
    for (const idx in this.devices) {
      const device = this.devices[idx];
      const position = await this.apiService.getDevicePosition(device.DeviceId);

      if (position.error !== undefined) {
        console.warn(`Unable to fetch position for device ${this.devices[idx].DeviceId} - maybe the location was never set in the first place?`);
        continue;
      }

      if (this.markers[position.DeviceId] === undefined) {
        let marker = new mapboxgl.Marker({color: '#ff0000'}).setLngLat(position.Position)
          .addTo(this.map);
        this.markers[position.DeviceId] = marker;
      } else {
        this.markers[position.DeviceId].setLngLat(position.Position);
      }
    }

    window.setTimeout(this._updateDevicePositions.bind(this, interval), interval);
  }

  async _initializeMap() {
    // extract the region from the Identity Pool ID
    AWS.config.region = COGNITO_IDENTITY_POOL_ID.split(":")[0];

    // configure the SDK to make use of the Cognito-provided credentials
    AWS.config.credentials = this.awsCredentials;

    // load credentials and set them up to refresh
    await this.awsCredentials.getPromise();

    // actually initialize the map
    this.map = new mapboxgl.Map({
      container: "map",
      center: [-3.6878047, 40.4763141], // initial map centerpoint
      zoom: 15, // initial map zoom
      style: MAP_NAME,
      transformRequest: this._transformRequest.bind(this),
    });

    let prom = new Promise((resolve, reject) => {
      // Some settings need to be applied after the map has loaded
      this.map.on('load', () => {
        // Add UI controls
        this.map.addControl(new mapboxgl.NavigationControl(), "top-left");

        // Register some event handlers
        this.map.on('click', this.onMapClick.bind(this));
        this.map.on('mousemove', this.onMapMouseMove.bind(this));

        // Add auxiliary sources and labels
        this.map.addSource('_newGeofence', {type: 'geojson', data: null});
        this.map.addLayer({
          id: '_newGeofence',
          type: 'fill',
          source: '_newGeofence',
          layout: {},
          paint: {
            'fill-color': '#00ff00',
            'fill-opacity': 0.3,
            'fill-outline-color': '#ff0000'
          }
        });

        this.map.addSource('_newDevice', {type: 'geojson', data: null});
        this.map.addLayer({
          id: '_newDevice',
          type: 'line',
          source: '_newDevice',
          layout: {},
          paint: {
            'line-color': '#00ff00',
            'line-width': 3
          }
        });

        this.map.addSource('geofences', {type: 'geojson', data: this.geofencesData});
        this.map.addLayer({
          id: 'geofences',
          type: 'fill',
          source: 'geofences',
          paint: {
            'fill-color': '#0000ff',
            'fill-opacity': 0.3,
            'fill-outline-color': '#000099'
          }
        });

        this.map.addSource('devices', {type: 'geojson', data: this.devicesData});
        this.map.addLayer({
          id: 'devices',
          type: 'line',
          source: 'devices',
          paint: {
            'line-color': '#ff0000',
            'line-width': 3
          }
        });

        resolve();
      });
    });

    return prom;
  }

  onMapClick(e) {
    console.debug('Map clicked on mode ' + this.mode);
    let source = null;
    switch (this.mode) {
      case 'default':
        // On default mode, clicking on a geofence or a device deletes it.
        let geofences = this.map.queryRenderedFeatures(e.point, {layers: ['geofences']});
        if (geofences.length) {
          let geofenceId = geofences[0].properties.id;
          this._deleteGeofence(geofenceId);
        }

        let devices = this.map.queryRenderedFeatures(e.point, {layers: ['devices']});
        if (devices.length) {
          let deviceId = devices[0].properties.id;
          this._deleteDevice(deviceId);
        }
        break;

      case 'createGeofence':
        // On geofence creation mode, clicking the map adds a point to the polygon.
        if (this.newGeofenceCoords === null) {
          this.newGeofenceCoords = [];
        }

        this.newGeofenceCoords.push([e.lngLat.lng, e.lngLat.lat]);

        source = this.map.getSource('_newGeofence');
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [this.newGeofenceCoords]
          }
        });
        break;

      case 'createDevice':
        if (this.newDeviceCoords === null) {
          this.newDeviceCoords = [];
        }

        this.newDeviceCoords.push([e.lngLat.lng, e.lngLat.lat]);

        source = this.map.getSource('_newDevice');
        source.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: this.newDeviceCoords
          }
        });
        break;
    }
  }

  onMapMouseMove(e) {
    switch (this.mode) {
      case 'createGeofence':
      case 'createDevice':
        this.map.getCanvas().style.cursor = 'crosshair';
        break;
      default:
        this.map.getCanvas().style.cursor = 'pointer';
    }
  }

  _toggleMode(mode) {
    this.mode = mode;
  }

  toggleDefaultMode() {
    this._toggleMode('default');
  }

  toggleGeofenceCreationMode() {
    this._toggleMode('createGeofence');
  }

  toggleDeviceCreationMode() {
    this._toggleMode('createDevice');
  }

  showLoadingOverlay(msg) {
    this.loadingText.innerHTML = msg;
    this.loadingOverlay.style.display = 'flex';
  }

  hideLoadingOverlay() {
    this.loadingOverlay.style.display = 'none';
    this.loadingText.innerHTML = '';
  }

  init() {
    this.showLoadingOverlay('Initializing...');

    // Register UI handlers
    this.toggleDefaultModeBtn.onclick = () => {this.toggleDefaultMode();};
    this.toggleGeofenceCreationModeBtn.onclick = () => {this.toggleGeofenceCreationMode();};
    this.toggleDeviceCreationModeBtn.onclick = () => {this.toggleDeviceCreationMode();};
    this.createGeofenceForm.onsubmit = (e) => {
      e.preventDefault();
      this._createGeofence();
    };
    this.createDeviceForm.onsubmit = (e) => {
      e.preventDefault();
      this._createDevice();
    };
    this.searchPoisForm.onsubmit = (e) => {
      e.preventDefault();
      this._searchPois();
    };

    // Initialize the map and fetch resources
    this._initializeMap()
      .then(() => {return Promise.all([this._getGeofences(), this._getDevices()]);})
      .then(d => {
        this._updateDevicePositions(3000);
        this.hideLoadingOverlay();
      });
  }
}

window.onload = () => {
  let apiService = new ApiService(API_ENDPOINT, API_KEY);
  let app = new App(apiService);
  app.init();
};
