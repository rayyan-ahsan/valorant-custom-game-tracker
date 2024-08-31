import { json } from 'react-router-dom';
import './App.css';
import './Login.css';
import { useState, useEffect, useRef } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { AlertTriangle } from 'lucide-react';
import BOPollVote from './BestOfSeriesPoll';
import SideSelectModal from './SideSelectChoice';
import { useNavigate } from 'react-router-dom';

function AlertDismissibleExample({ show, handleClose, gameId, username }) {

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      size="md"
    >
      <Modal.Header className="bg-danger text-white border-bottom-0">
        <Modal.Title className="d-flex align-items-center">
          <AlertTriangle className="me-2" />
          Are you sure?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center py-4">
        Leaving this game will cancel the game for everyone else.
      </Modal.Body>
      <Modal.Footer className="border-top-0 justify-content-center">
      <Button variant="outline-danger" onClick={() => {
        killLobby(gameId, username)
        handleClose()}}>
          Yes, I'm sure
        </Button>
        <Button variant="outline-success" onClick={handleClose}>
          No, I don't want to leave.
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function KillAlert({ show, message, navigate }) {

  return (
    <Modal
      show={show}
      centered
      size="md"
    >
      <Modal.Header className="bg-danger text-white border-bottom-0">
        <Modal.Title className="d-flex align-items-center">
          <AlertTriangle className="me-2" />
          Game Cancelled
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center py-4">
        {message}
      </Modal.Body>
      <Modal.Footer className="border-top-0 justify-content-center">
        <Button variant="outline-success" onClick={() => {navigate("/")}}>
          Okay
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function killLobby(gameId, username){
  fetch(`/api/killlobby`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({
      "gameId": gameId,
      "username": username,
    })
  })
  .then((res) => res.json())
  .then((data) => {
    console.log("lobby died", data)
  })
  .catch((err) => {
    console.log("kill Lobby err:", err)
  })
}

//const initialPlayers = [['rayyan',0,0], ['MistaDong',0,0], ['iMaple',0,0], ['Allie',0,0], ['Ria',0,0], ['Chi',0,0], ['TenZ',0,0], ['Vincent',0,0], ['Jordan',0,0], ['Evan',0,0]];
const initialMaps = [['Abyss', 0, 0] , ['Ascent',0,0], ['Bind',0,0], ['Haven',0,0], ['Icebox',0,0], ['Lotus',0,0], ['Sunset',0,0]];

function GamePage() {
  const [players, setPlayers] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(1);
  const [pickCount, setPickCount] = useState(0);
  const [allPicked, setAllPicked] = useState(false);
  const [votes, setVotes] = useState({ bo1: 0, bo2: 0, bo3: 0 });
  const [hasVoted, setHasVoted] = useState({})
  const [votingComplete, setVotingComplete] = useState(false);
  const [mapList, setMapList] = useState(initialMaps);
  const [mapPhase, setMapPhase] = useState('ban');
  const [currentUser, setCurrentUser] = useState(null);
  const [username, setUsername] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [show, setShow] = useState(false)
  const [finalResult, setFinalResult] = useState(null)
  const [matchFormat, setMatchFormat] = useState(null)
  const [movingMap, setMovingMap] = useState(null)
  const [mapSides, setMapSides] = useState({});
  const [sideMap, setSideMap] = useState(null)
  const [meTeamBoyo, setMeTeamBoyo] = useState(null)
  const [showSideSelect, setShowSideSelect] = useState(false)
  const [showAlert, setShowAlert] = useState(false)
  const [showKillAlert, setShowKillAlert] = useState(false)
  const [killMessage, setKillMessage] = useState("Lobby has been cancelled.")
  const gameId = window.location.href.toString().slice(-5)
  const lastClickTime = useRef(0);

  const handleCloseAlert = () => setShowAlert(false)
  const handleShowAlert = () => {
    setShowAlert(true)
  }

  const navigate = useNavigate();

  const handleClose = () => setShow(false);
  const currentUserRef = useRef(null);
  const currentMapListRef = useRef(null)
  
  /*
  const liveTeamView = new EventSource(`/api/liveteamview?gameId=${gameId}`)
  liveTeamView.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    let newPlayers = [...players]
    newPlayers = message.map(d => [d.Username, d.Captain, d.Team])
    setPlayers(newPlayers)
  })
  liveTeamView.addEventListener('error', (error) => {
    console.log("An error occurred: ", error)
  })
  */

  const countPlayersInTeam = (teamNumber) => {
    return players.filter(player => player[2] === teamNumber).length;
  };

  const checkLoginStatus = async () => {
    try {
      console.log("FETCHING USERNAME £:", username)
      const response = await fetch('/api/user', {
        method: 'GET',
        credentials: 'include', // important for sending cookies
      });
      if (response.ok) {
        const data = await response.json();
        setUsername(data.username);
      }
    } catch (error) {
      console.error('Error checking login status:', error);
    } finally {
      setIsLoading(false)
    }
  };

  useEffect(() => {
    checkLoginStatus();
  }, []);

  useEffect(() => {
    console.log("checking map veto")
    const allPlayersAssigned = players.every(player => player[2] !== 0 && player[2] !== null);
    console.log("are all players assigned? :", allPlayersAssigned)
    if(allPlayersAssigned){
      fetch(`/api/getmapveto?gameId=${gameId}`, {
        method: 'GET',
        credentials: 'include',
      })
      .then((res) => res.json())
      .then((data) => {
        console.log("yippee")
        const newMaps = data.mapList.map(m => [m.Name, m.Team, m.Action])
        setMapList(newMaps)
        setFinalResult(data.format)
        setMatchFormat(data.format)
        setMapPhase(data.mapPhase)
        setCurrentTeam(Number(data.mapTeam))
        console.log(data)
      })
      .catch((err) => {
        console.log("getmapveto err:",err)
      })
    }
  }, [players])

  useEffect(() => {
    console.log("Final Result has changed:", finalResult)
  }, [finalResult])

  useEffect(() => {
    console.log("current team has changed:", currentTeam)
  }, [currentTeam])

  useEffect(() => {
    console.log("Render conditions:", {
      votingComplete,
      finalResult,
      mapListLength: mapList.length
    });
    if (finalResult) {
      console.log(`The final result is: ${finalResult}`);
      // Request map list from the server
      fetch(`/api/getmaplist?gameId=${gameId}`, {
        method: 'GET',
        credentials: 'include',
      })
      .then(response => response.json())
      .then(data => {
        setMapList(data.maps);
      })
      .catch(error => {
        console.error("Error fetching map list:", error);
        //setMapList(initialMaps)
        setCurrentTeam(1)
      });
    }
  }, [finalResult, gameId])

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    currentMapListRef.current = mapList;
  }, [mapList]);

  useEffect(() => {

    console.log("liveteamview opened")
    const liveTeamView = new EventSource(`/api/liveteamview?gameId=${gameId}`);
    
    liveTeamView.addEventListener('updateLobby', (event) => {
      const message = JSON.parse(event.data);
      console.log("new players :33333 :", event.data)
      setPlayers(message.map(d => [d.Username, d.Captain, d.Team]));
      const currentUserData = players.find(player => player[0] === username);
      if(currentUserData){
        setCurrentUser(currentUserData);
      }
    });

    liveTeamView.addEventListener('kill', (event) => {
      const message = JSON.parse(event.data);
      setKillMessage(message)
      setShowKillAlert(true)
    })

    liveTeamView.addEventListener('mapList', (event) => {
      const maps = JSON.parse(event.data);
      console.log("received maps uwu:", maps)
      const previousMapList = currentMapListRef.current
      const newMapList = maps.map(m => [m.Name, m.Team, m.Action])
      const newPickedMaps = newMapList.filter(map => {
        const previousMap = previousMapList.find(prevMap => prevMap[0] === map[0]);
        return previousMap && previousMap[2] === 0 && map[2] === 1 && map[1] !== currentUserRef.current[2];
    });
      setMapList(maps.map(m => [m.Name, m.Team, m.Action]))
      const allPlayersAssigned = players.every(player => player[2] !== 0 && player[2] !== null);
      if(isUserCaptain && allPlayersAssigned && newPickedMaps.length > 0 && (newPickedMaps[0][1] !== currentUserRef.current[2])) {
        console.log("its me hehehe")
        setSideMap(newPickedMaps[0][0])
        setMeTeamBoyo(currentUserRef.current[2])
        console.log("showSideSelect :3", showSideSelect)
        setShowSideSelect(true)
      }
    });

    liveTeamView.addEventListener('currentTeam', (event) => {
      const currentTeam = JSON.parse(event.data)
      console.log("new team or something", event.data)
      if(currentTeam.length === 1) {
        var newTeam = Number(currentTeam)
      } else {
        if(currentTeam.substr(0,1) === "p"){
          setMapPhase("pick")
        } else if(currentTeam.substr(0,1) === "b"){
          setMapPhase("ban")
        } else if(currentTeam.substr(0,1) === 'd'){
          setMapPhase("done")
        }
        newTeam = Number(currentTeam.substr(currentTeam.length - 1))
      }
      setCurrentTeam(newTeam)
    })

    liveTeamView.addEventListener('bestofseriesVote', (event) => {
      const message = JSON.parse(event.data)
      console.log("best of series vote has come in:", message)
      if (Array.isArray(message) && message.length === 3) {
        setVotes({
          bo1: message[0],
          bo2: message[1],
          bo3: message[2]
        });
      } else if (message === "vote time") {
        setShow(true);
      }
    })

    liveTeamView.addEventListener('mapsides', (event) => {
      const message = JSON.parse(event.data);
      const newMapSides = {};
      for (let i = 0; i < message.length; i++) {
        const { MapName, AttackerTeam } = message[i];
        newMapSides[MapName] = AttackerTeam;
      }
      setMapSides(newMapSides);
      console.log(mapSides)
    });

    liveTeamView.addEventListener('error', (error) => {
      console.log("An error occurred: ", error);
    });

    
  
    return () => {
      console.log("liveteamview closed")
      liveTeamView.close(); // Clean up the connection when the component unmounts
    };
  }, [gameId]);

  useEffect(() => {
    console.log("username is: ", username)
    if(username) {
      assignCaptains();
    }
  }, [username])

  useEffect(() => {
    console.log("changed userdata is: ", currentUser)
  }, [currentUser])

  const determineNextTeam = () => {
    const team1 = countPlayersInTeam(1);
    const team2 = countPlayersInTeam(2);
    const totalPlayers = team1 + team2;

    let newCurrentTeam;

    // Determine the pick sequence based on the total number of players picked
    if (totalPlayers < 8) {  // Changed from 5 to 8 to cover all initial picks
        // Initial picks
        if (team1 === 0 && team2 === 0) {
            newCurrentTeam = 1; // Team 1 starts
        } else if (team1 === 1 && team2 === 0) {
            newCurrentTeam = 2; // Team 2 picks 2 players
        } else if (team1 === 1 && team2 === 2) {
            newCurrentTeam = 1; // Team 1 picks 2 players
        } else if (team1 === 3 && team2 === 2) {
            newCurrentTeam = 2; // Team 2 picks 1 player
        } else if (team1 === 3 && team2 === 3) {
            newCurrentTeam = 1; // Team 1 picks 1 player
        } else if (team1 === 4 && team2 === 3) {
            newCurrentTeam = 2; // Team 2 picks last player
        } else {
            newCurrentTeam = team1 <= team2 ? 1 : 2; // Alternates if not in specific case
        }
    } else {
        // All players are picked
        newCurrentTeam = 0;
    }

    return newCurrentTeam;  // Return the new team instead of setting it
};

  const assignCaptains = () => {
    let newPlayers = [...players];

    // Assign Team 1 Captain
    fetch("/api/playersinlobby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({
        "gameId": gameId,
        "Username": username,
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log("here's the data for playersinlobby: ", data);
      console.log("this is the gameid we have:",gameId)
    
      // Now fetch /api/getplayers after the first request completes
      return fetch("/api/getplayers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          "gameId": gameId,
        })
      });
    })
    .then((res) => res.json())
    .then((data) => {
      newPlayers = data.map(d => [d.Username, d.Captain, d.Team])
      console.log("newplayers: ", newPlayers)
      setPlayers(newPlayers);
      const currentUserData = newPlayers.find(player => player[0] === username);
      setCurrentUser(currentUserData);
    })
    .catch((err) => {
      console.log(err.message);
    })
  };

  const isUserCaptain = () => {
    return currentUser && currentUser[1] === 1;
  };

  const isUsersTurn = () => {
    return isUserCaptain() && currentUser[2] === currentTeam;
  };

  const pickPlayer = (playerName) => {
    if (!currentUser || !isUsersTurn()) return;

    const currentTime = new Date().getTime();
    if (currentTime - lastClickTime.current < 500) { // 500ms debounce time
      console.log("Click too soon, ignoring");
      return;
    }
    lastClickTime.current = currentTime;
    const playerIndex = players.findIndex(player => player[0] === playerName);
    if (playerIndex === -1 || players[playerIndex][2] !== 0) return;

    let newPlayers = [...players];
    //newPlayers[playerIndex][2] = currentTeam;

    setPlayers(newPlayers);
    setPickCount(prevCount => prevCount + 1);

    // Determine next picking team
    /*
    if (pickCount === 0) {
      setCurrentTeam(2);
    } else if (pickCount === 2) {
      setCurrentTeam(1)
    } else if (pickCount === 4) {
      setCurrentTeam(2);
    } else if (pickCount > 4) {
      setCurrentTeam(currentTeam === 1 ? 2: 1)
    }
    */
    fetch("/api/updateteam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({
        "gameId": gameId,
        "Username": playerName,
        "Team": currentTeam
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log("updated team: ", data)
    })
    .catch((err) => {
      console.log(err.message);
    })
    //newPlayers[playerIndex][2] = currentTeam;
    

    if (pickCount === 7) {
      setAllPicked(true)
    }
  };

  const vote = (playerName, format) => {
    if (hasVoted[playerName]) return;

    setVotes(prevVotes => ({
      ...prevVotes,
      [format]: prevVotes[format] + 1
    }));

    setHasVoted(prevHasVoted => ({
      ...prevHasVoted,
      [playerName]: true
    }));

    if (Object.keys(hasVoted).length + 1 === players.filter(player => player[2] !== 0).length) {
      setVotingComplete(true);
      determineMatchFormat();
    }

  };

  const determineMatchFormat = () => {
    const winningFormat = Object.entries(votes).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    setMatchFormat(winningFormat);
  };

  const renderTeam = (teamNumber) => {
    return (
      <div className="team">
        <h2>Team {teamNumber}</h2>
        {players
          .filter(([, , team]) => team === teamNumber)
          .map(([name, captain], index) => (
            <div key={index} className={`player ${captain ? 'captain' : ''}`}>
              {name} {captain ? '(Captain)' : ''}
            </div>
          ))}
        {mapList.filter(map => map[1] === teamNumber && map[2] === 1).length > 0 && (
          <>
            <hr />
            <h4>Picked Maps:</h4>
            <div className="picked-maps">
              {mapList
                .filter(map => map[1] === teamNumber && map[2] === 1)
                .map((map, index) => (
                  <div key={index} className="map-container picked">
                    <div className="side-indicator left">
                  {mapSides[map[0]] === 1 ? 'A' : 'D'}
                </div>
                    <div
                      className="map-image"
                      style={{
                        backgroundImage: `url(${getMapImage(map[0])})`,
                        filter: 'blur(0.6px)',
                      }}
                    ></div>
                    <div className="map-text">
                      {map[0]}
                    </div>
                    <div className="side-indicator right">
                  {mapSides[map[0]] === 2 ? 'A' : 'D'}
                </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderUnassigned = () => {
    return players
      .filter(([, , team]) => team === 0)
      .map(([name]) => (
        <div 
          key={name} 
          className={`player ${isUsersTurn() ? 'selectable' : ''}`} 
          onClick={() => isUsersTurn() ? pickPlayer(name) : null}
        >
          {name}
        </div>
      ));
  };

  const getMapImage = (mapName) => {
    const mapImages = {
      'Abyss': 'https://images2.imgbox.com/48/64/6BUhB8Oj_o.png',
      'Ascent': 'https://images2.imgbox.com/66/9a/I9toTyBk_o.png',
      'Bind': 'https://images2.imgbox.com/91/87/seyjTXY5_o.png',
      'Lotus': 'https://images2.imgbox.com/18/5a/0oc7LF5r_o.png',
      'Breeze': 'https://images2.imgbox.com/13/22/986ZafWv_o.png',
      'Fracture': 'https://images2.imgbox.com/9c/12/qH4i0PIi_o.png',
      'Pearl': 'https://images2.imgbox.com/6a/82/bMVkfOLQ_o.png',
      'Haven': 'https://images2.imgbox.com/04/cf/qbxEIa4t_o.png',
      'Icebox': 'https://images2.imgbox.com/79/fe/TI4tw5hG_o.png',
      'Split': 'https://images2.imgbox.com/d4/ad/SOEGTAek_o.png',
      'Sunset': 'https://images2.imgbox.com/af/5d/diCaG56c_o.png',
      // add all your maps here
    };
  
    return mapImages[mapName] || 'default_image_url';
  };

  const handleMapAction = (mapName) => {
    console.log("this is mapname? :", mapName)
    if (!currentUser || !isUsersTurn()) return;
    const mapPick = mapList.filter(map => map[0] === mapName)
    console.log("mapPick is", mapPick)
    if(mapPick[0][2] === 2 || mapPick[0][2] === 1){
      console.log("this map has already been picked")
      return;
    }
    const bannedCountOg = mapList.filter(map => map[2] === 2).length;
    const pickedCountOg = mapList.filter(map => map[2] === 1).length;
    if (finalResult == "bo1") {
      if (pickedCountOg == 1) {
        return
      }
    } else if (finalResult == "bo2") {
      if (pickedCountOg == 2) {
        return
      }
    } else if (finalResult == "bo3") {
      if (pickedCountOg == 2 && bannedCountOg == 4) {
        return
      }
    }

    setCurrentTeam(0)

    fetch("/api/updatemap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({
        "gameId": gameId,
        "mapName": mapName,
        "Team": currentTeam,
        "Action": mapPhase,
        "FinalVote": finalResult,
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log("updated maps: ", data)
    })
    .catch((err) => {
      console.log(err.message);
    })

    const updatedMapList = mapList.map(map =>
      map[0] === mapName
        ? [map[0], currentTeam, mapPhase === 'ban' ? 2 : 1]
        : map
    );
    setMapList(updatedMapList);

    //setCurrentTeam(currentTeam === 1 ? 2 : 1);

    const bannedCount = updatedMapList.filter(map => map[2] === 2).length;
    const pickedCount = updatedMapList.filter(map => map[2] === 1).length;
    
    switch (finalResult) {
      case "bo1": {
        if (pickedCount == 1){
          setMapPhase("done")
        }
      }
      case "bo2": {
        if (pickedCount == 2){
          setMapPhase("done")
        }
      }
      case "bo3": {
        if (pickedCount == 2 && bannedCount == 4){
          setMapPhase("done")
        }
      }
    }
    /*

    // Switch teams
    

    if(finalResult === 'bo1'){
      if(bannedCount === 4){
        setMapPhase('pick')
      }
    } else if(finalResult === 'bo2') {
      if(bannedCount === 1){
        setMapPhase('pick')
      }
    } else if (finalResult === 'bo3') {
      if(bannedCount === 1){
        setMapPhase('pick')
      } else if(bannedCount === 2 && pickedCount === 1){
        setMapPhase('ban')
      }
    }
      */

    /*

    // Determine next phase
    if (finalResult === 'bo1' && bannedMaps.length === 6) {
      setPickedMaps([...pickedMaps, maps[0]]);
      setMaps([]);
    } else if (finalResult === 'bo2' && pickedMaps.length === 1 && maps.length === 1) {
      setPickedMaps([...pickedMaps, maps[0]]);
      setMaps([]);
    } else if (finalResult === 'bo3' && pickedMaps.length === 2 && maps.length === 1) {
      setPickedMaps([...pickedMaps, maps[0]]);
      setMaps([]);
    } else if (bannedMaps.length === 4) {
      setMapPhase('pick');
    }
      */
  };

  const renderMapPickBan = () => {

    const pickedMap = mapList.find(map => map[2] === 1);
    console.log("mapPhase is: ", mapPhase)

    const sortedPickedMaps = mapList
        .filter(map => map[2] === 1)
        .sort((a, b) => a[1] - b[1]);

    const isCurrentUserTurn = currentUser && currentUser[1] === 1 && currentUser[2] === currentTeam;

    console.log("this is sorted picked maps: ",sortedPickedMaps)
    console.log("this is pickedMaps", pickedMap)

    return (
        <div className="map-pick-ban">
            <h3 style={{paddingBottom: "10px", textAlign: "center"}}>
              {mapPhase === 'done' 
                ? 'Picked Maps' 
                : isCurrentUserTurn
                  ? `Your Turn to ${mapPhase === 'ban' ? 'Ban' : 'Pick'} a Map`
                  : `Map ${mapPhase === 'ban' ? 'Ban' : 'Pick'} Phase (Team ${currentTeam})`
              }
            </h3>
            <div className="map-list">
              {mapPhase === "done" ? (
                sortedPickedMaps.map((map) => (

                  <div
                    key={map[0]}
                    className="map-container picked"
                >
                  <div className="side-indicator left">
                  {mapSides[map[0]] === 1 ? 'A' : 'D'}
                </div>
                  <div
                      className='map-image'
                      style={{
                        backgroundImage: `url(${getMapImage(map[0])})`,
                        filter: 'blur(0.6px)',
                      }}
                  ></div>
                  <div
                      className='map-text'
                  >{map[0]}</div>
                  <div className="side-indicator right">
                  {mapSides[map[0]] === 2 ? 'A' : 'D'}
                </div>
                </div>

                ))
                
              ) : (
                mapList
                    .filter(map => map[2] !== 1)  // Only show maps that haven't been picked
                    .map((map) => (
                        <div
                            key={map[0]}
                            className={`map-container ${map[2] !== 0 ? 'disabled' : ''}`}
                            onClick={() => handleMapAction(map[0])}
                        >
                            <div
                                className="map-image"
                                style={{
                                    backgroundImage: `url(${getMapImage(map[0])})`,
                                    filter: 'blur(0.6px)',
                                }}
                            ></div>
                            <div className="map-text">
                                {map[0]}
                            </div>
                        </div>
                    )))} 
            </div>
        </div>
    );
  };

  

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
    <div className="game-page">
      <BOPollVote
      show={show} 
      handleClose={handleClose} 
      votes={votes}
      setVotes={setVotes} 
      hasVoted={hasVoted[username]} 
      setHasVoted={() => setHasVoted({ ...hasVoted, [username]: true })} 
      handleSubmitVote={(selectedVote) => {
        if (!hasVoted[username]) {
          vote(username, selectedVote);
        }}}
      gameId = {gameId}
      setFinalResult={setFinalResult}
      />
      <SideSelectModal
      show={showSideSelect}
      setShow={setShowSideSelect}
      gameId={gameId}
      team={meTeamBoyo}
      mapName={sideMap}
      />
      {renderTeam(1)}
      <div className="player-list">
        <h3>
          {finalResult 
            ? (finalResult.toUpperCase()) 
            : currentTeam === 0
              ? ""
              : `Unassigned ${isUsersTurn() ? "(Your turn to pick)" : `(Team ${currentTeam} to pick)`}`}
        </h3>
        {finalResult ? renderMapPickBan() : renderUnassigned()}
      </div>
      {renderTeam(2)}
    </div>
    <div className='justify-content-center fixed-bottom hehe'>
    <Button className="btn-danger nav-item btnSideSelect btnLeaveGame justify-content-center" onClick={() => {setShowAlert(true)}}>Leave Game</Button>
    <AlertDismissibleExample show={showAlert} handleClose={handleCloseAlert} gameId={gameId} username={username} />
    <KillAlert show={showKillAlert} message={killMessage} navigate={navigate}></KillAlert>
    </div>
    </>
  );
}

export default GamePage;

//(votingComplete || finalResult) && 