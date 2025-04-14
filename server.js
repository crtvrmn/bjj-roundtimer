
const FRONTEND_URL = "http://192.168.178.113:3000";
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        //origin: "http://meinedomain.de",
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

// Session-Daten speichern (in-memory)
const sessions = {};

// Funktion zum Laden der Konfiguration für eine Session
function loadConfig(sessionId) {
    const configFilename = `config-${sessionId}.json`;
    try {
        const config = JSON.parse(fs.readFileSync(configFilename, 'utf-8'));
        return {
            roundTime: parseInt(config.roundTime),
            pauseTime: parseInt(config.pauseTime),
            combatants: config.combatants,
            round: 1
        };
    } catch (error) {
        console.error(`Error loading ${configFilename}:`, error);
        // Wenn die Session-Konfiguration nicht gefunden wird, erstelle eine Standardkonfiguration
        const defaultConfig = {
            roundTime: 300,
            pauseTime: 60,
            combatants: {}
        };
        // Schreibe die Standardkonfiguration in die Datei
        try {
            fs.writeFileSync(configFilename, JSON.stringify(defaultConfig, null, 2), 'utf-8');
            console.log(`Created default configuration for session ${sessionId} in ${configFilename}`);
            return {
                roundTime: defaultConfig.roundTime,
                pauseTime: defaultConfig.pauseTime,
                combatants: defaultConfig.combatants,
                round: 1
            };
        } catch (writeError) {
            console.error(`Error writing default configuration to ${configFilename}:`, writeError);
            // Wenn auch das Schreiben der Datei fehlschlägt, verwende Fallback-Werte
            return {
                roundTime: 300,
                pauseTime: 60,
                combatants: {},
                round: 1
            };
        }
    }
}

// Funktion zum Speichern der Konfiguration für eine Session (optional, für persistente Speicherung)
function saveConfig(sessionId, config) {
    const configFilename = `config-${sessionId}.json`;
    // Stelle sicher, dass roundTime und pauseTime als Ganzzahlen gespeichert werden
    if (config.roundTime !== undefined) {
        config.roundTime = parseInt(config.roundTime, 10);
    }
    if (config.pauseTime !== undefined) {
        config.pauseTime = parseInt(config.pauseTime, 10);
    }
    try {
        fs.writeFileSync(configFilename, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`Configuration saved to ${configFilename}`);
    } catch (error) {
        console.error(`Error saving configuration to ${configFilename}:`, error);
    }
}

function roundRobinPairing(combatants, round, username) {
    const combatantList = Object.values(combatants);
    const numCombatants = combatantList.length;
    // If there are an odd number of combatants, add a "PAUSE"
    if (numCombatants % 2 !== 0) {
        combatantList.push("PAUSE");
    }
    
    // Rotate the combatant list based on the round number
    const rotatedList = rotateList(combatantList, round);
    
    let roundPairs = [];
    let userIsInMatch = false; // Flag, um zu überprüfen, ob der Benutzer Teil des Matchups ist
    for (let i = 0; i < rotatedList.length / 2; i++) {
        const fighter1 = rotatedList[i];
        const fighter2 = rotatedList[rotatedList.length - 1 - i];
        roundPairs.push(`${fighter1} : ${fighter2}`);
        // Überprüfe, ob der Benutzer Teil des Matchups ist
        if (fighter1 === username || fighter2 === username) {
            userIsInMatch = true;
        }
    }
    let match_list = "";
    let on_pause = "";
    roundPairs.forEach(entry => {
        if (!entry.includes("PAUSE")) {
            match_list += entry + "\n";
        } else {
            on_pause = doingPause(entry);
        }
    });

    return {
        matches: match_list,
        pause: on_pause,
        rotatedList: rotatedList,
        userIsInMatch: userIsInMatch // Gib das Flag zurück
    };
}

function rotateList(list, round) {
    if (list.length <= 1) return list; // Keine Rotation bei 0 oder 1 Element
    const firstElement = list[0];
    const rest = list.slice(1);
    const rotation = round % rest.length;
    const rotatedRest = [...rest.slice(rotation), ...rest.slice(0, rotation)];
    return [firstElement, ...rotatedRest];
}

function doingPause(entry) {
    const parts = entry.split(" : ");
    if (parts.length === 2) {
        return parts[0] === "PAUSE" ? parts[1] : parts[0];
    }
    return "";
}

function advanceRound(sessionId) {
    sessions[sessionId].round++;
    let currentMatches = roundRobinPairing(sessions[sessionId].combatants, sessions[sessionId].round);
    io.to(sessionId).emit('roundUpdate', { round: sessions[sessionId].round, matches: currentMatches , pause: currentMatches.pause}); // Send update to all clients in the session
    console.log(`Session ${sessionId} roundUpdate: Round ${sessions[sessionId].round}, \nmatches: ${currentMatches.matches}`);
}

function updateTime(sessionId) {
    const session = sessions[sessionId];

    if (!session) {
        console.error(`Session ${sessionId} not found.`);
        return;
    }

    if (session.roundTime > 0) {
        session.roundTime--;
        io.to(sessionId).emit('roundTimeUpdate', session.roundTime); // Send time to all clients in the session
    } else if (session.pauseTime > 0) {
        if (session.pauseTime === session.config.pauseTime) {
            // Berechne und sende die Matches der nächsten Runde zu Beginn der Pause
            const nextRoundMatches = roundRobinPairing(session.combatants, session.round + 1);
            console.log(nextRoundMatches)
            io.to(sessionId).emit('roundUpdate', { round: session.round + 1, matches: nextRoundMatches , pause: nextRoundMatches.pause });
            console.log(`Session ${sessionId} Comming Up Next: Round ${session.round + 1}, \nmatches: ${nextRoundMatches.matches}`);
        }
        session.pauseTime--;
        io.to(sessionId).emit('pauseTimeUpdate', session.pauseTime); // Send time to all clients in the session
    } else {
        clearInterval(session.timerInterval);
        console.log(`Round ${session.round} over for session ${sessionId}, advancing to round ${session.round + 1}`);
        advanceRound(sessionId);

        // Reset round and pause times
        session.roundTime = typeof session.config.roundTime === 'number' && session.config.roundTime > 0
            ? session.config.roundTime
            : 300; // Default to 300 if invalid

        session.pauseTime = typeof session.config.pauseTime === 'number' && session.config.pauseTime > 0
            ? session.config.pauseTime
            : 60; // Default to 60 if invalid

        io.to(sessionId).emit('roundTimeUpdate', session.roundTime);
        io.to(sessionId).emit('pauseTimeUpdate', session.pauseTime);

        // Restart timer for the next round
        session.timerInterval = setInterval(() => updateTime(sessionId), 1000);
    }
}

io.on('connection', (socket) => {
    const sessionId = socket.handshake.query.sessionId;
    const username = socket.handshake.query.username;

    if (!sessionId) {
        console.error('No session ID provided');
        socket.disconnect(true); // Trenne die Verbindung
        return;
    }

    if (!username) {
        console.error('No username provided');
        socket.disconnect(true); // Trenne die Verbindung
        return;
    }

    socket.join(sessionId); // Füge den Socket dem Raum hinzu
    console.log(`User ${username} connected to session ${sessionId}` + (sessions[sessionId] ? `,(roundTime: ${sessions[sessionId].roundTime} seconds, pauseTime: ${sessions[sessionId].pauseTime} seconds)` : ``));

    // Session-Daten initialisieren, falls noch nicht vorhanden
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            config: loadConfig(sessionId), // Konfiguration laden
            roundTime: loadConfig(sessionId).roundTime, // Aktuelle Rundenzeit
            pauseTime: loadConfig(sessionId).pauseTime,
            combatants: loadConfig(sessionId).combatants,
            round: loadConfig(sessionId).round,
            timerInterval: null, // Timer-Intervall
            users: {} // Objekt zum Speichern der Benutzernamen
        };
    }

    // Speichere den Benutzernamen für diese Session
    sessions[sessionId].users[socket.id] = username;
    // Überprüfe, ob der Benutzer bereits in den combatants ist, wenn nicht, füge ihn hinzu
    if (!Object.values(sessions[sessionId].combatants).includes(username)) {
        const newCombatantId = Object.keys(sessions[sessionId].combatants).length + 1;
        sessions[sessionId].combatants[newCombatantId] = username;
    }




    // Initial matches berechnen
    let currentMatches = roundRobinPairing(sessions[sessionId].combatants, sessions[sessionId].round, username);
    console.log(` -> Current combatants: ${JSON.stringify(sessions[sessionId].combatants)}`)
    // Sende die aktualisierten Daten an alle Clients in der Session
    io.to(sessionId).emit('initialData', {
        roundTime: sessions[sessionId].roundTime,
        round: sessions[sessionId].round,
        matches: currentMatches,
        userIsInMatch: currentMatches.userIsInMatch, // Sende das Flag mit
        combatants: sessions[sessionId].combatants, // Sende die aktualisierte Kämpferliste mit
        pauseTime: sessions[sessionId].pauseTime
    }); 

    socket.on('startTimer', () => {
        console.log(`Received startTimer event from session ${sessionId} from user ${username}`);
        if (!sessions[sessionId].timerInterval) {
            sessions[sessionId].timerInterval = setInterval(() => updateTime(sessionId), 1000);
        }
        io.to(sessionId).emit('timerStarted', username);
    });

    socket.on('stopTimer', () => {
        console.log(`Received stopTimer event from session ${sessionId} from user ${username}`);
        if (sessions[sessionId].timerInterval) {
            clearInterval(sessions[sessionId].timerInterval);
            sessions[sessionId].timerInterval = null;
            io.to(sessionId).emit('timerStopped', username);
        }
    });

    socket.on('updateConfig', (data) => {
        const { sessionId, roundTime, pauseTime, combatants } = data;

        console.log(`Received updateConfig event from session ${sessionId} with data:`, data);

        if (sessions[sessionId]) {
            sessions[sessionId].config = {
                roundTime: roundTime,
                pauseTime: pauseTime,
                combatants: JSON.parse(combatants)
            };
            
            sessions[sessionId].roundTime = roundTime;
            sessions[sessionId].pauseTime = pauseTime;
            sessions[sessionId].combatants = JSON.parse(combatants);

            saveConfig(sessionId, sessions[sessionId].config);

            io.to(sessionId).emit('configUpdated', sessions[sessionId].config);
        } else {
            console.error(`Session ${sessionId} not found`);
        }
        });
    });
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
