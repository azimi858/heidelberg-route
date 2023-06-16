import { useCallback, useEffect, useState } from "react";
import "./App.scss";
import { BarLoader } from "react-spinners";
const neo4j = require("neo4j-driver");
const driver = neo4j.driver("bolt://34.201.5.14:7687", neo4j.auth.basic("neo4j", "formats-hunts-interference"));

const mapArea = [49.43394050775212, 8.621141066717644, 49.395801809827034, 8.72828845937252];
const mapSize = [1270, 709];

function App() {
  const [places, setPlaces] = useState([]);
  const [allRoutes, setAllRoutes] = useState([]);
  const [fromPlace, setFromPlace] = useState(null);
  const [toPlace, setToPlace] = useState(null);
  const [availableRoutes, setAvailableRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const updatePlaces = useCallback(async () => {
    setIsLoading(true);
    const session = driver.session();
    const result = await session.run("MATCH (n:Place) RETURN n");
    const placesTmp = result.records.map((r) => {
      const match = r.get("n");
      return {
        ...match.properties,
        labels: match.labels,
      };
    });
    session.close();
    setPlaces(placesTmp);
    setIsLoading(false);
  }, []);

  const updateRoutes = useCallback(async () => {
    setIsLoading(true);
    const session = driver.session();
    const result = await session.run("MATCH (x)-[r:DRIVE]->(y) RETURN r");
    const placesTmp = result.records.map((r) => {
      const match = r.get("r");
      return {
        ...match.properties,
        km: parseFloat(match.properties.km),
        minute: parseFloat(match.properties.minute),
      };
    });
    session.close();
    setAllRoutes(placesTmp);
    setIsLoading(false);
  }, []);

  // init
  useEffect(() => {
    const orderedCalls = async () => {
      await updatePlaces();
      await updateRoutes();
    };
    orderedCalls();
  }, [updatePlaces, updateRoutes]);

  const circleClicked = (nodeId) => {
    const selectedPlace = places.filter((p) => p.id === nodeId)[0];
    if (fromPlace === null || toPlace !== null) {
      setFromPlace(selectedPlace);
      setToPlace(null);
      setAvailableRoutes([]);
    } else {
      setToPlace(selectedPlace);
    }
  };

  const calculateRoutes = useCallback(async () => {
    if (!fromPlace?.id || !toPlace?.id) {
      return;
    }
    setIsLoading(true);
    const session = driver.session();
    const result = await session.run(`
      MATCH path = (x)-[r:DRIVE*]-(y) 
        WHERE apoc.coll.duplicates(NODES(path)) = []
        AND x.id = '${fromPlace.id}' and y.id = '${toPlace.id}'
      RETURN r
    `);
    const allPossible = result.records.map((r) => {
      const match = r.get("r");
      const paths = match.map((r) => ({
        ...r.properties,
        km: parseFloat(r.properties.km),
        minute: parseFloat(r.properties.minute),
      }));
      const totalKm = paths.map((r) => r.km).reduce((a, b) => a + b, 0);
      const totalMinute = paths.map((r) => r.minute).reduce((a, b) => a + b, 0);
      return {
        totalKm,
        totalMinute,
        paths,
      };
    });
    session.close();
    const topBest = allPossible.sort((a, b) => a.totalKm - b.totalKm).slice(0, 3);
    setAvailableRoutes(topBest);
    setIsLoading(false);
  }, [fromPlace, toPlace]);

  // everytime a path is selected
  useEffect(() => {
    calculateRoutes();
  }, [calculateRoutes, fromPlace, toPlace]);

  const getMapPosition = (lat, lng) => {
    const cx = ((lng - mapArea[1]) / (mapArea[3] - mapArea[1])) * mapSize[0];
    const cy = ((lat - mapArea[0]) / (mapArea[2] - mapArea[0])) * mapSize[1];
    return { cx, cy };
  };

  return (
    <div className="app">
      <h1>Heidelberg Route finder</h1>
      <label>
        <input type="checkbox" />
        map/Satellite
      </label>
      <div className="main">
        <div className="map">
          <div className="map-content">
            <svg className="map-board" viewBox={`0 0 ${mapSize[0]} ${mapSize[1]}`}>
              {availableRoutes.length === 0 &&
                allRoutes.map((r) => {
                  const startNode = places.filter((p) => p.id === r.from)[0];
                  const endNode = places.filter((p) => p.id === r.to)[0];
                  const startPosition = getMapPosition(startNode.lat, startNode.lng);
                  const endPosition = getMapPosition(endNode.lat, endNode.lng);
                  return (
                    <line
                      key={r.id}
                      x1={startPosition.cx}
                      y1={startPosition.cy}
                      x2={endPosition.cx}
                      y2={endPosition.cy}
                      stroke="#dddddd55"
                      strokeWidth="4"
                    />
                  );
                })}
              {availableRoutes
                // .sort((a, b) => b.totalKm - a.totalKm)
                .map((fullPath, idx) => {
                  const color = idx === 0 ? "blue" : idx === 1 ? "green" : "pink";
                  return fullPath.paths.map((r) => {
                    const startNode = places.filter((p) => p.id === r.from)[0];
                    const endNode = places.filter((p) => p.id === r.to)[0];
                    const startPosition = getMapPosition(startNode.lat, startNode.lng);
                    const endPosition = getMapPosition(endNode.lat, endNode.lng);
                    return (
                      <line
                        key={`path${idx}-${r.id}`}
                        x1={startPosition.cx}
                        y1={startPosition.cy}
                        x2={endPosition.cx}
                        y2={endPosition.cy}
                        stroke={color}
                        strokeWidth={10 - idx * 2}
                      />
                    );
                  });
                })}
              {places.map((p) => (
                <circle
                  key={p.id}
                  {...getMapPosition(p.lat, p.lng)}
                  r="10"
                  onClick={() => circleClicked(p.id)}
                  className={`place-node ${p.labels.join(" ")}`}
                />
              ))}
            </svg>
            <img className="map-bg" src="/heidelberg.png" alt="Heidelberg Satellite" />
          </div>
        </div>
        <div className="paths">
          <div className="path-content">
            {fromPlace ? (
              <>
                From: <strong>{fromPlace.name}</strong>
              </>
            ) : (
              <>
                Select <strong>From</strong> location
              </>
            )}
          </div>
          {fromPlace && (
            <div className="path-content">
              {toPlace ? (
                <>
                  To: <strong>{toPlace.name}</strong>
                </>
              ) : (
                <>
                  Select <strong>To</strong> location
                </>
              )}
            </div>
          )}
          {availableRoutes?.length > 0 && (
            <div className="available-routes">
              Available routes:
              {availableRoutes
                // .sort((a, b) => a.totalKm - b.totalKm)
                .map((fullPath, idx) => {
                  const color = idx === 0 ? "blue" : idx === 1 ? "green" : "pink";
                  return (
                    <div className="route">
                      <div className="header">
                        <strong>Route {idx + 1} </strong>{" "}
                        <div className="color-box" style={{ backgroundColor: color }}></div>
                      </div>
                      <div className="header">Distance: {fullPath.totalKm.toLocaleString()} Km</div>
                      <div className="header">Minutes: {fullPath.totalMinute.toLocaleString()} min</div>
                      <div className="header">Steps:</div>
                      {fullPath.paths.map((r, idx2) => {
                        const startNode = places.filter((p) => p.id === r.from)[0];
                        const endNode = places.filter((p) => p.id === r.to)[0];
                        return (
                          <div className="step">
                            {idx2 + 1}. Take the path between "<strong>{startNode.name}</strong>" and "
                            <strong>{endNode.name}</strong>" ({r.km}km, {r.minute}mins)
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}
          {isLoading && (
            <div className="loading-box">
              <BarLoader color="#36d7b7" height={7} width={200} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
