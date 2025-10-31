// Minimal GPX merger with preview and Leaflet map rendering

(function () {
    const uploadSectionEl = document.getElementById('upload-section');
    const uploadTitleEl = document.getElementById('upload-title');
    const resultSectionEl = document.getElementById('result-section');
    const reuploadBtnEl = document.getElementById('reupload-btn');
    const fileInputEl = document.getElementById('gpx-files');
    const dropzoneEl = document.getElementById('dropzone');
    const browseBtnEl = document.getElementById('browse-btn');
    const demoBtnEl = document.getElementById('demo-btn');
    const demoBtnContainerEl = document.getElementById('demo-btn-container');
    const removeGapsCheckbox = document.getElementById('remove-gaps');
    const filenameInputEl = document.getElementById('filename-input');
    const dataSummaryEl = document.getElementById('data-summary');
    const downloadBtnEl = document.getElementById('download-btn');
    const mapContainerEl = document.getElementById('map');
    const hrChartEl = document.getElementById('hr-chart');

    let mergedTrackpoints = [];
    let mergedMetadata = { name: 'Merged GPX', time: null };
    let parsedTracks = []; // Store parsed tracks for reprocessing
    let activityMode = 'bike'; // 'bike' or 'run'
    let uploadedFilenames = []; // Store original filenames

    function parseGpx(xmlString) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, 'application/xml');
        const parserError = xml.querySelector('parsererror');
        if (parserError) {
            throw new Error('Invalid GPX XML');
        }

        const nameNode = xml.querySelector('gpx > metadata > name, gpx > trk > name');
        const timeNode = xml.querySelector('gpx > metadata > time');
        const trkpts = Array.from(xml.querySelectorAll('trk trkseg trkpt'));
        const points = trkpts.map((pt) => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            const eleNode = pt.querySelector('ele');
            const timeNodePt = pt.querySelector('time');
            const hrNode = pt.querySelector('extensions TrackPointExtension hr, extensions gpxtpx\\:TrackPointExtension gpxtpx\\:hr');
            return {
                lat,
                lon,
                ele: eleNode ? parseFloat(eleNode.textContent) : null,
                time: timeNodePt ? new Date(timeNodePt.textContent) : null,
                hr: hrNode ? parseFloat(hrNode.textContent) : null,
            };
        });

        return {
            name: nameNode ? nameNode.textContent : null,
            time: timeNode ? new Date(timeNode.textContent) : null,
            points,
        };
    }

    function mergeTracks(tracks, removeGaps = false) {
        const allPoints = tracks.flatMap((t, fileIndex) => 
            t.points.map(p => ({ ...p, fileIndex }))
        );
        // Sort by time if present; otherwise keep file order
        allPoints.sort((a, b) => {
            if (a.time && b.time) return a.time - b.time;
            if (a.time && !b.time) return -1;
            if (!a.time && b.time) return 1;
            return 0;
        });

        if (!removeGaps || allPoints.length === 0) return allPoints;

        // Remove time gaps: recalculate timestamps to be continuous
        return removeTimeGaps(allPoints);
    }

    function removeTimeGaps(points) {
        if (points.length === 0) return points;
        
        // Find first point with a timestamp
        const firstTimePoint = points.find(p => p.time);
        if (!firstTimePoint) return points; // No timestamps to adjust

        // Calculate average time between consecutive points to detect gaps
        const timeDiffs = [];
        for (let i = 1; i < points.length; i++) {
            if (points[i].time && points[i - 1].time) {
                timeDiffs.push(points[i].time - points[i - 1].time);
            }
        }
        
        if (timeDiffs.length === 0) return points;
        
        // Median time diff to detect outliers (gaps)
        timeDiffs.sort((a, b) => a - b);
        const medianDiff = timeDiffs[Math.floor(timeDiffs.length / 2)];
        const gapThreshold = medianDiff * 10; // Consider 10x median as a gap

        let cumulativeTimeOffset = 0;
        let previousOriginalTime = null;
        
        return points.map((p, idx) => {
            if (!p.time) return { ...p };
            
            if (idx === 0) {
                previousOriginalTime = p.time;
                return { ...p, time: new Date(p.time) };
            }

            // Check if there's a gap
            const timeSincePrevious = p.time - previousOriginalTime;
            if (timeSincePrevious > gapThreshold) {
                // Found a gap, offset future timestamps
                cumulativeTimeOffset += timeSincePrevious - medianDiff;
            }

            previousOriginalTime = p.time;
            const adjustedTime = new Date(p.time.getTime() - cumulativeTimeOffset);
            
            return { ...p, time: adjustedTime };
        });
    }

    function computeBounds(points) {
        if (points.length === 0) return null;
        let minLat = points[0].lat;
        let maxLat = points[0].lat;
        let minLon = points[0].lon;
        let maxLon = points[0].lon;
        for (const p of points) {
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLon) minLon = p.lon;
            if (p.lon > maxLon) maxLon = p.lon;
        }
        return { minLat, maxLat, minLon, maxLon };
    }

    function formatDistanceMeters(m) {
        if (!Number.isFinite(m)) return 'n/a';
        if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
        return `${m.toFixed(0)} m`;
    }

    function formatDurationMs(ms) {
        if (!Number.isFinite(ms) || ms < 0) return 'n/a';
        const totalSeconds = Math.floor(ms / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    function formatSpeed(kmPerHour) {
        if (!Number.isFinite(kmPerHour) || kmPerHour <= 0) return 'n/a';
        return `${kmPerHour.toFixed(1)} km/h`;
    }

    function formatPace(minPerKm) {
        if (!Number.isFinite(minPerKm) || minPerKm <= 0) return 'n/a';
        const minutes = Math.floor(minPerKm);
        const seconds = Math.round((minPerKm - minutes) * 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
    }

    function computeStats(points) {
        const stats = { distanceM: 0, elevationGainM: 0, elevationLossM: 0, numPoints: points.length, startTime: null, endTime: null };
        if (points.length === 0) return stats;
        let prev = points[0];
        for (let i = 1; i < points.length; i++) {
            const cur = points[i];
            // distance using haversine
            stats.distanceM += haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
            // elevation gain/loss
            if (prev.ele != null && cur.ele != null) {
                const delta = cur.ele - prev.ele;
                if (delta > 0) stats.elevationGainM += delta;
                if (delta < 0) stats.elevationLossM += Math.abs(delta);
            }
            prev = cur;
        }
        // earliest/latest timestamps across all points
        for (const p of points) {
            if (!p.time) continue;
            if (!stats.startTime || p.time < stats.startTime) stats.startTime = p.time;
            if (!stats.endTime || p.time > stats.endTime) stats.endTime = p.time;
        }
        return stats;
    }

    function toRad(x) { return (x * Math.PI) / 180; }
    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function renderDataSummary(points) {
        if (!dataSummaryEl) return;
        if (!points || points.length === 0) {
            dataSummaryEl.innerHTML = '<p class="map__empty">No data.</p>';
            return;
        }
        const stats = computeStats(points);
        const hrStats = computeHrStats(points);
        const durationMs = stats.startTime && stats.endTime ? (stats.endTime - stats.startTime) : NaN;
        // Get current checkbox state before re-rendering
        const currentCheckbox = document.getElementById('remove-gaps');
        const isGapsRemoved = currentCheckbox ? currentCheckbox.checked : false;
        
        // Calculate speed/pace metrics
        const distanceKm = stats.distanceM / 1000;
        const durationHours = durationMs / (1000 * 60 * 60);
        const avgSpeed = durationHours > 0 ? distanceKm / durationHours : 0;
        const durationMinutes = durationMs / (1000 * 60);
        const avgPace = distanceKm > 0 ? durationMinutes / distanceKm : 0;
        
        // Build appropriate metric based on activity mode
        let speedPaceHtml = '';
        if (activityMode === 'bike') {
            speedPaceHtml = `<div class="rounded-md bg-gray-50 p-2"><span class="font-medium">Avg. speed:</span> ${formatSpeed(avgSpeed)}</div>`;
        } else {
            speedPaceHtml = `<div class="rounded-md bg-gray-50 p-2"><span class="font-medium">Avg. pace:</span> ${formatPace(avgPace)}</div>`;
        }
        
        // Build heart rate HTML if available
        let hrHtml = '';
        if (hrStats && hrStats.hasData) {
            hrHtml = `
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <div class="grid grid-cols-3 gap-2">
                        <div class="rounded-md bg-red-50 p-2 text-center">
                            <div class="text-xs text-gray-600">Avg HR</div>
                            <div class="text-lg font-semibold text-red-600">${hrStats.avg}</div>
                        </div>
                        <div class="rounded-md bg-red-50 p-2 text-center">
                            <div class="text-xs text-gray-600">Max HR</div>
                            <div class="text-lg font-semibold text-red-600">${hrStats.max}</div>
                        </div>
                        <div class="rounded-md bg-red-50 p-2 text-center">
                            <div class="text-xs text-gray-600">Min HR</div>
                            <div class="text-lg font-semibold text-red-600">${hrStats.min}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        dataSummaryEl.innerHTML = `
            <div class="text-sm text-gray-700">
                <div class="grid grid-cols-2 gap-2">
                    <div class="rounded-md bg-gray-50 p-2"><span class="font-medium">Distance:</span> ${formatDistanceMeters(stats.distanceM)}</div>
                    <div class="rounded-md bg-gray-50 p-2"><span class="font-medium">Duration:</span> ${formatDurationMs(durationMs)}</div>
                    ${speedPaceHtml}
                    <div class="rounded-md bg-gray-50 p-2"><span class="font-medium">Elevation:</span> +${Math.round(stats.elevationGainM)} m</div>
                </div>
                ${hrHtml}
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" id="remove-gaps" class="rounded border-gray-300 cursor-pointer" ${isGapsRemoved ? 'checked' : ''}>
                        <span>Remove time gaps between files</span>
                    </label>
                </div>
            </div>
        `;
    }

    function renderMergedFilesList(filenames) {
        const mergedFilesSectionEl = document.getElementById('merged-files-section');
        const mergedFilesListEl = document.getElementById('merged-files-list');
        
        if (!mergedFilesSectionEl || !mergedFilesListEl) return;
        
        if (!filenames || filenames.length === 0) {
            mergedFilesSectionEl.classList.add('u-hidden');
            return;
        }
        
        mergedFilesSectionEl.classList.remove('u-hidden');
        
        const filesHtml = filenames.map((name, index) => {
            const color = segmentColors[index % segmentColors.length];
            return `<div class="merged-file-item rounded-md bg-gray-50 p-2 mb-1.5 font-mono text-xs break-all cursor-pointer hover:bg-gray-100 transition-colors flex items-center gap-2" data-file-index="${index}">
                <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${color};"></span>
                <span>${escapeHtml(name)}</span>
            </div>`;
        }).join('');
        
        mergedFilesListEl.innerHTML = filesHtml;
        
        // Add hover handlers
        const fileItems = mergedFilesListEl.querySelectorAll('.merged-file-item');
        fileItems.forEach(item => {
            const fileIndex = parseInt(item.dataset.fileIndex);
            item.addEventListener('mouseenter', () => highlightSegment(fileIndex));
            item.addEventListener('mouseleave', () => resetSegmentHighlight());
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    let leafletMap = null;
    let leafletLayers = { polylines: [], start: null, end: null, tiles: null };
    let segmentColors = ['#3b82f6', '#dc2626', '#ec4899', '#8b5cf6', '#06b6d4', '#7c3aed'];

    function ensureLeafletMap() {
        if (leafletMap) return leafletMap;
        if (!mapContainerEl) return null;
        leafletMap = L.map(mapContainerEl, {
            zoomControl: true,
            attributionControl: true,
        }).setView([0, 0], 2);

        leafletLayers.tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(leafletMap);

        // Fix size after initial render
        setTimeout(() => leafletMap && leafletMap.invalidateSize(), 0);
        return leafletMap;
    }

    function clearLeafletLayers() {
        if (!leafletMap) return;
        const { polylines, start, end } = leafletLayers;
        if (polylines) {
            polylines.forEach(layer => {
                if (layer.polyline) leafletMap.removeLayer(layer.polyline);
            });
        }
        if (start) leafletMap.removeLayer(start);
        if (end) leafletMap.removeLayer(end);
        leafletLayers.polylines = [];
        leafletLayers.start = null;
        leafletLayers.end = null;
    }

    function renderMap(points) {
        const map = ensureLeafletMap();
        if (!map) return;
        clearLeafletLayers();

        if (!points || points.length === 0) {
            map.setView([0, 0], 2);
            return;
        }

        // Group consecutive points by fileIndex
        const segments = [];
        let currentSegment = { fileIndex: points[0].fileIndex || 0, points: [points[0]] };
        
        for (let i = 1; i < points.length; i++) {
            const fileIndex = points[i].fileIndex !== undefined ? points[i].fileIndex : 0;
            if (fileIndex === currentSegment.fileIndex) {
                currentSegment.points.push(points[i]);
            } else {
                segments.push(currentSegment);
                currentSegment = { fileIndex: fileIndex, points: [points[i]] };
            }
        }
        segments.push(currentSegment);

        // Draw each segment with a different color
        leafletLayers.polylines = segments.map(segment => {
            const latlngs = segment.points.map(p => [p.lat, p.lon]);
            const color = segmentColors[segment.fileIndex % segmentColors.length];
            
            const polyline = L.polyline(latlngs, {
                color: color,
                weight: 3,
                opacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
            }).addTo(map);
            
            return {
                fileIndex: segment.fileIndex,
                polyline: polyline,
                defaultWeight: 3,
                defaultOpacity: 0.9
            };
        });

        // Add start/end markers
        const allLatLngs = points.map(p => [p.lat, p.lon]);
        leafletLayers.start = L.circleMarker(allLatLngs[0], {
            radius: 5,
            color: '#28a745',
            fillColor: '#28a745',
            fillOpacity: 1,
            weight: 2,
        }).addTo(map).bindTooltip('Start');

        leafletLayers.end = L.circleMarker(allLatLngs[allLatLngs.length - 1], {
            radius: 5,
            color: '#dc3545',
            fillColor: '#dc3545',
            fillOpacity: 1,
            weight: 2,
        }).addTo(map).bindTooltip('End');

        const bounds = L.latLngBounds(allLatLngs).pad(0.05);
        map.fitBounds(bounds, { animate: true });
    }

    function highlightSegment(fileIndex) {
        if (!leafletLayers.polylines) return;
        
        leafletLayers.polylines.forEach(layer => {
            if (layer.fileIndex === fileIndex) {
                layer.polyline.setStyle({ weight: 4 });
                layer.polyline.bringToFront();
            }
        });
    }

    function resetSegmentHighlight() {
        if (!leafletLayers.polylines) return;
        
        leafletLayers.polylines.forEach(layer => {
            layer.polyline.setStyle({ 
                weight: layer.defaultWeight
            });
        });
    }

    function computeHrStats(points) {
        const hrValues = points.map(p => p.hr).filter(hr => hr != null && hr > 0);
        if (hrValues.length === 0) return null;
        
        const avg = hrValues.reduce((sum, hr) => sum + hr, 0) / hrValues.length;
        const max = Math.max(...hrValues);
        const min = Math.min(...hrValues);
        
        return { avg: Math.round(avg), max, min, hasData: true };
    }

    function smoothHeartRate(hrPoints, windowSize = 5) {
        if (hrPoints.length < windowSize) return hrPoints;
        
        return hrPoints.map((point, index) => {
            const start = Math.max(0, index - Math.floor(windowSize / 2));
            const end = Math.min(hrPoints.length, index + Math.ceil(windowSize / 2));
            const window = hrPoints.slice(start, end);
            const avgHr = window.reduce((sum, p) => sum + p.hr, 0) / window.length;
            
            return { ...point, hr: avgHr };
        });
    }

    function formatDistanceLabel(meters) {
        if (!Number.isFinite(meters)) return '0';
        const km = meters / 1000;
        if (km >= 1) {
            return km.toFixed(1) + ' km';
        }
        return Math.round(meters) + ' m';
    }
    
    function calculateCumulativeDistance(points) {
        const distances = [0];
        let cumulative = 0;
        
        for (let i = 1; i < points.length; i++) {
            const dist = haversineMeters(
                points[i - 1].lat,
                points[i - 1].lon,
                points[i].lat,
                points[i].lon
            );
            cumulative += dist;
            distances.push(cumulative);
        }
        
        return distances;
    }

    function renderHeartRateChart(points) {
        if (!hrChartEl) return;
        
        // Clear existing content
        hrChartEl.innerHTML = '';
        
        if (!points || points.length === 0) {
            hrChartEl.innerHTML = '<p class="hr-chart__empty">No data.</p>';
            return;
        }
        
        // Calculate cumulative distance for ALL points first
        const allCumulativeDistances = calculateCumulativeDistance(points);
        const totalDistance = allCumulativeDistances[allCumulativeDistances.length - 1];
        
        // Filter points with valid heart rate and map to their actual route distances
        let hrPoints = points
            .map((p, index) => ({ ...p, distance: allCumulativeDistances[index] }))
            .filter(p => p.hr != null && p.hr > 0 && p.time);
        
        if (hrPoints.length === 0) {
            hrChartEl.innerHTML = '<p class="hr-chart__empty">No heart rate data available.</p>';
            return;
        }
        
        // Smooth the heart rate data
        hrPoints = smoothHeartRate(hrPoints, 10);
        
        // Extract distances for HR points (already calculated from full route)
        const cumulativeDistances = hrPoints.map(p => p.distance);
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'hr-chart__canvas';
        hrChartEl.appendChild(canvas);
        
        // Set canvas size
        const rect = hrChartEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 20, bottom: 35, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        // Get HR range
        const hrValues = hrPoints.map(p => p.hr);
        const minHr = Math.min(...hrValues);
        const maxHr = Math.max(...hrValues);
        const hrRange = maxHr - minHr;
        const yPadding = hrRange * 0.1;
        const yMin = Math.max(0, minHr - yPadding);
        const yMax = maxHr + yPadding;
        const yRange = yMax - yMin;
        
        // Draw grid lines and Y-axis labels
        ctx.strokeStyle = '#e5e7eb';
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.lineWidth = 1;
        
        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const y = padding.top + (chartHeight / numYTicks) * i;
            const hrValue = Math.round(yMax - (yRange / numYTicks) * i);
            
            // Grid line
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            
            // Label
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(hrValue + ' bpm', padding.left - 5, y);
        }
        
        // Draw X-axis distance labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        const numXTicks = Math.min(6, hrPoints.length);
        for (let i = 0; i < numXTicks; i++) {
            const distance = (i / (numXTicks - 1)) * totalDistance;
            const x = padding.left + (distance / totalDistance) * chartWidth;
            const distanceLabel = formatDistanceLabel(distance);
            
            // Draw tick mark
            ctx.strokeStyle = '#d1d5db';
            ctx.beginPath();
            ctx.moveTo(x, padding.top + chartHeight);
            ctx.lineTo(x, padding.top + chartHeight + 5);
            ctx.stroke();
            
            // Draw label
            ctx.fillText(distanceLabel, x, padding.top + chartHeight + 8);
        }
        
        // Draw heart rate line
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        hrPoints.forEach((point, index) => {
            const x = padding.left + (point.distance / totalDistance) * chartWidth;
            const y = padding.top + chartHeight - ((point.hr - yMin) / yRange) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Draw filled area under the line
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.closePath();
        ctx.fill();
    }

    function buildMergedGpx(points) {
        const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>`;
        const gpxOpen = `<gpx version="1.1" creator="GPX Merger" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">`;
        const meta = `<metadata><name>${escapeXml(mergedMetadata.name)}</name>${mergedMetadata.time ? `<time>${mergedMetadata.time.toISOString()}</time>` : ''}</metadata>`;
        const trkOpen = `<trk><name>${escapeXml(mergedMetadata.name)}</name><trkseg>`;
        const pts = points
            .map((p) => {
                const ele = p.ele != null && !Number.isNaN(p.ele) ? `<ele>${p.ele}</ele>` : '';
                const time = p.time ? `<time>${p.time.toISOString()}</time>` : '';
                const hr = p.hr != null && p.hr > 0 ? `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>` : '';
                return `<trkpt lat="${p.lat}" lon="${p.lon}">${ele}${time}${hr}</trkpt>`;
            })
            .join('');
        const trkClose = `</trkseg></trk>`;
        const gpxClose = `</gpx>`;
        return [xmlHeader, gpxOpen, meta, trkOpen, pts, trkClose, gpxClose].join('');
    }

    function escapeXml(str) {
        return String(str).replace(/[<>&"']/g, (ch) => {
            switch (ch) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '"': return '&quot;';
                case "'": return '&apos;';
                default: return ch;
            }
        });
    }

    function getTimeOfDayPrefix(date) {
        if (!date || !(date instanceof Date)) return '';
        const hour = date.getHours();
        if (hour >= 5 && hour < 11) return 'Morning';
        if (hour >= 11 && hour < 14) return 'Lunch';
        if (hour >= 14 && hour < 18) return 'Afternoon';
        if (hour >= 18 && hour < 22) return 'Evening';
        return 'Night';
    }

    function generateFilenameSuggestion(points) {
        if (!points || points.length === 0) return 'merged-activity';
        const stats = computeStats(points);
        const startTime = stats.startTime;
        if (!startTime) return 'merged-activity';
        
        const timePrefix = getTimeOfDayPrefix(startTime);
        const activityType = activityMode === 'bike' ? 'Bike Ride' : 'Run';
        return `${timePrefix} ${activityType}`;
    }

    function enableDownload(points) {
        if (!downloadBtnEl) return;
        if (!points || points.length === 0) {
            downloadBtnEl.disabled = true;
            downloadBtnEl.onclick = null;
            return;
        }
        downloadBtnEl.disabled = false;
        downloadBtnEl.onclick = () => {
            const xml = buildMergedGpx(points);
            const blob = new Blob([xml], { type: 'application/gpx+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Get filename from input, fallback to 'merged' if empty
            let filename = filenameInputEl ? filenameInputEl.value.trim() : '';
            if (!filename) filename = 'merged-activity';
            // Ensure .gpx extension
            if (!filename.toLowerCase().endsWith('.gpx')) filename += '.gpx';
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        };
    }

    function readSelectedFiles(fileList) {
        const readers = [];
        for (const file of fileList) {
            readers.push(
                new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, text: e.target.result });
                    reader.onerror = reject;
                    reader.readAsText(file);
                })
            );
        }
        return Promise.all(readers);
    }

    function showResultsView() {
        if (dropzoneEl) dropzoneEl.classList.add('u-hidden');
        if (uploadTitleEl) uploadTitleEl.classList.add('u-hidden');
        if (reuploadBtnEl) reuploadBtnEl.classList.remove('u-hidden');
        if (resultSectionEl) resultSectionEl.classList.remove('u-hidden');
        if (demoBtnContainerEl) demoBtnContainerEl.classList.add('u-hidden');
    }

    function showUploadView() {
        if (dropzoneEl) dropzoneEl.classList.remove('u-hidden');
        if (uploadTitleEl) uploadTitleEl.classList.remove('u-hidden');
        if (reuploadBtnEl) reuploadBtnEl.classList.add('u-hidden');
        if (resultSectionEl) resultSectionEl.classList.add('u-hidden');
        if (demoBtnContainerEl) demoBtnContainerEl.classList.remove('u-hidden');
    }

    function reprocessMerge() {
        // Get the checkbox dynamically since it's re-rendered
        const checkbox = document.getElementById('remove-gaps');
        const removeGaps = checkbox ? checkbox.checked : false;
        mergedTrackpoints = mergeTracks(parsedTracks, removeGaps);
    }

    function processGpxResults(results) {
        const tracks = [];
        const filenames = []; // Collect filenames
        for (const { name, text } of results) {
            try {
                const t = parseGpx(text);
                tracks.push(t);
                filenames.push(name); // Store filename
            } catch (e) {
                console.error('Failed to parse a GPX file:', e);
            }
        }
        parsedTracks = tracks; // Store for reprocessing
        uploadedFilenames = filenames; // Store globally
        mergedMetadata.name = 'Merged GPX';
        mergedMetadata.time = new Date();
        reprocessMerge();
        // Set filename suggestion based on time of day
        if (filenameInputEl) {
            filenameInputEl.value = generateFilenameSuggestion(mergedTrackpoints);
        }
        showResultsView();
        // Ensure map is initialized after container is visible
        const map = ensureLeafletMap();
        setTimeout(() => map && map.invalidateSize(), 0);
        renderMap(mergedTrackpoints);
        renderHeartRateChart(mergedTrackpoints);
        renderDataSummary(mergedTrackpoints);
        renderMergedFilesList(uploadedFilenames); // Render the filenames list
        enableDownload(mergedTrackpoints);
    }

    function handleFilesAuto(files) {
        if (!files || files.length === 0) return;
        readSelectedFiles(files)
            .then((results) => {
                processGpxResults(results);
                if (fileInputEl) fileInputEl.value = '';
            })
            .catch((err) => {
                console.error('Error reading files:', err);
                alert('Failed to read files. See console for details.');
                if (fileInputEl) fileInputEl.value = '';
            });
    }

    async function loadDemoFiles() {
        const demoFiles = [
            'demo/vargarda-cycling.gpx',
            'demo/resume-after-coffee-break.gpx',
            'demo/continue-after-puncture.gpx'
        ];
        
        try {
            const fetchPromises = demoFiles.map(async (filePath) => {
                const response = await fetch(filePath);
                if (!response.ok) throw new Error(`Failed to fetch ${filePath}`);
                const text = await response.text();
                const name = filePath.split('/').pop(); // Extract filename
                return { name, text };
            });
            
            const results = await Promise.all(fetchPromises);
            processGpxResults(results);
        } catch (err) {
            console.error('Error loading demo files:', err);
            alert('Failed to load demo files. Make sure the demo folder exists.');
        }
    }

    // Initialize
    function init() {
        // Initial view
        showUploadView();

        // Activity mode buttons
        const modeBikeBtn = document.getElementById('mode-bike');
        const modeRunBtn = document.getElementById('mode-run');
        
        if (modeBikeBtn) {
            modeBikeBtn.addEventListener('click', () => {
                activityMode = 'bike';
                modeBikeBtn.classList.add('activity-mode-btn--active');
                if (modeRunBtn) modeRunBtn.classList.remove('activity-mode-btn--active');
                if (mergedTrackpoints.length > 0) {
                    renderDataSummary(mergedTrackpoints);
                    // Update filename suggestion
                    if (filenameInputEl) {
                        filenameInputEl.value = generateFilenameSuggestion(mergedTrackpoints);
                    }
                }
            });
        }
        
        if (modeRunBtn) {
            modeRunBtn.addEventListener('click', () => {
                activityMode = 'run';
                modeRunBtn.classList.add('activity-mode-btn--active');
                if (modeBikeBtn) modeBikeBtn.classList.remove('activity-mode-btn--active');
                if (mergedTrackpoints.length > 0) {
                    renderDataSummary(mergedTrackpoints);
                    // Update filename suggestion
                    if (filenameInputEl) {
                        filenameInputEl.value = generateFilenameSuggestion(mergedTrackpoints);
                    }
                }
            });
        }

        // Automatic handling when selecting via hidden input
        if (fileInputEl) {
            fileInputEl.addEventListener('change', () => handleFilesAuto(fileInputEl.files));
        }
        if (browseBtnEl && fileInputEl) {
            browseBtnEl.addEventListener('click', (e) => {
                fileInputEl.click(); // Just open file dialog without preventDefault / stopPropagation
            });
        }
        if (demoBtnEl) {
            demoBtnEl.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent dropzone click
                loadDemoFiles();
            });
        }
        if (reuploadBtnEl && fileInputEl) {
            reuploadBtnEl.addEventListener('click', () => {
                fileInputEl.click(); // Ensure reupload opens dialog too
            });
        }
        // Use event delegation for checkbox since it's re-rendered
        if (dataSummaryEl) {
            dataSummaryEl.addEventListener('change', (e) => {
                if (e.target && e.target.id === 'remove-gaps') {
                    if (parsedTracks.length > 0) {
                        reprocessMerge();
                        renderMap(mergedTrackpoints);
                        renderHeartRateChart(mergedTrackpoints);
                        renderDataSummary(mergedTrackpoints);
                        enableDownload(mergedTrackpoints);
                    }
                }
            });
        }
        if (dropzoneEl) {
            const highlight = () => dropzoneEl.classList.add('ring-2', 'ring-blue-400');
            const unhighlight = () => dropzoneEl.classList.remove('ring-2', 'ring-blue-400');
            ['dragenter', 'dragover'].forEach((evt) => {
                dropzoneEl.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    highlight();
                });
            });
            ['dragleave', 'drop'].forEach((evt) => {
                dropzoneEl.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    unhighlight();
                });
            });
            dropzoneEl.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt && dt.files ? Array.from(dt.files).filter((f) => /\.gpx$/i.test(f.name)) : [];
                handleFilesAuto(files);
            });
            // Click to open file picker (ignore clicks on interactive children)
            dropzoneEl.addEventListener('click', (e) => {
                const target = e.target;
                if (!target) return;
                if (target.closest && target.closest('button, input, a')) return;
                e.preventDefault();
                if (fileInputEl) fileInputEl.click();
            });
        }
        // Defer map init until results are shown to avoid zero-size issues
        renderDataSummary([]);
        enableDownload([]);
    }

    document.addEventListener('DOMContentLoaded', init);
})();


