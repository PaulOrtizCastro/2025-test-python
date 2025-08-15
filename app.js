'use strict';

(function () {
  // Centro aproximado de Perú
  const peruCenterLonLat = [-75.015152, -9.189967];

  // Capa base OSM
  const baseLayer = new ol.layer.Tile({
    source: new ol.source.OSM()
  });

  // Fuente y capa de puntos de ejemplo
  const pointsSource = new ol.source.Vector({ features: [] });
  const pointStyle = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({ color: '#1976d2' }),
      stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
    })
  });
  const pointsLayer = new ol.layer.Vector({
    source: pointsSource,
    style: pointStyle
  });

  // Mapa
  const map = new ol.Map({
    target: 'map',
    layers: [baseLayer, pointsLayer],
    view: new ol.View({
      center: ol.proj.fromLonLat(peruCenterLonLat),
      zoom: 5
    }),
    controls: ol.control.defaults()
  });

  // Popup
  const container = document.getElementById('popup');
  const content = document.getElementById('popup-content');
  const closer = document.getElementById('popup-closer');
  const popupOverlay = new ol.Overlay({
    element: container,
    autoPan: { animation: { duration: 250 } },
    offset: [0, -10]
  });
  map.addOverlay(popupOverlay);

  closer.addEventListener('click', function (evt) {
    evt.preventDefault();
    popupOverlay.setPosition(undefined);
    closer.blur();
  });

  // Cargar puntos desde GeoJSON
  fetch('data/points.json')
    .then(r => r.json())
    .then(geojson => {
      const features = new ol.format.GeoJSON().readFeatures(geojson, {
        featureProjection: map.getView().getProjection()
      });
      pointsSource.addFeatures(features);
    })
    .catch(err => console.error('No se pudieron cargar los puntos:', err));

  // Mostrar popup al hacer clic en un punto
  map.on('singleclick', function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f, {
      layerFilter: l => l === pointsLayer
    });

    if (feature) {
      const props = feature.getProperties();
      const nombre = props.nombre || 'Punto sin nombre';
      const tipo = props.tipo ? `<span class="badge text-bg-primary ms-1">${props.tipo}</span>` : '';
      const descripcion = props.descripcion || '';

      content.innerHTML = `
        <div class="mb-1 fw-bold">${nombre} ${tipo}</div>
        <div class="text-secondary small">${descripcion}</div>
      `;
      popupOverlay.setPosition(evt.coordinate);
    } else {
      popupOverlay.setPosition(undefined);
    }
  });

  // Cambiar cursor al pasar sobre puntos
  map.on('pointermove', function (evt) {
    const hit = map.hasFeatureAtPixel(evt.pixel, { layerFilter: l => l === pointsLayer });
    map.getTargetElement().classList.toggle('ol-cursor-pointer', !!hit);
  });

  // =====================
  // Buscador con Nominatim
  // =====================
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchResults = document.getElementById('search-results');

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function hideResults() {
    searchResults.classList.add('d-none');
    searchResults.innerHTML = '';
  }

  function showResults() {
    searchResults.classList.remove('d-none');
  }

  async function nominatimSearch(query) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('countrycodes', 'pe');
    try {
      const resp = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.error('Error al buscar en Nominatim:', e);
      return [];
    }
  }

  const doSearch = debounce(async function () {
    const q = searchInput.value.trim();
    if (q.length < 3) {
      hideResults();
      return;
    }
    const results = await nominatimSearch(q);
    if (!results.length) {
      searchResults.innerHTML = '<div class="list-group-item small text-secondary">Sin resultados</div>';
      showResults();
      return;
    }

    searchResults.innerHTML = '';
    for (const r of results) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-group-item list-group-item-action';
      const display = r.display_name || `${r.lat}, ${r.lon}`;
      item.textContent = display;
      item.addEventListener('click', () => {
        const lon = parseFloat(r.lon);
        const lat = parseFloat(r.lat);
        const coord = ol.proj.fromLonLat([lon, lat]);
        if (r.boundingbox && r.boundingbox.length === 4) {
          const [latMin, latMax, lonMin, lonMax] = r.boundingbox.map(Number);
          const extent = ol.proj.transformExtent([lonMin, latMin, lonMax, latMax], 'EPSG:4326', map.getView().getProjection());
          map.getView().fit(extent, { duration: 500, padding: [40, 40, 40, 40], maxZoom: 18 });
        } else {
          map.getView().animate({ center: coord, zoom: 17, duration: 400 });
        }
        hideResults();
      });
      searchResults.appendChild(item);
    }
    showResults();
  }, 350);

  searchInput.addEventListener('input', doSearch);
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  searchClear.addEventListener('click', function () {
    searchInput.value = '';
    hideResults();
    searchInput.focus();
  });

  // Cerrar los resultados si se hace clic fuera
  document.addEventListener('click', function (e) {
    const sc = document.getElementById('search-control');
    if (!sc.contains(e.target) && e.target.id !== 'search-input') {
      hideResults();
    }
  });

  // Exponer para depurar si se desea
  window._map = map;
})();