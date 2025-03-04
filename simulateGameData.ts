
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Represents a live game in our simulation
 */
interface Game {
  game_id: string;
  home_team: string;
  away_team: string;
  score: string;
  status: 'scheduled' | 'in_progress' | 'finished';
  minute: number;
  startTime: number;
  odds: {
    home_win: number;
    draw: number;
    away_win: number;
  };
}

/**
 * Broadcast payload for each event
 */
interface GameUpdatePayload {
  game_id: string;
  home_team: string;
  away_team: string;
  score: string;
  status: string;
  minute: number;
  event: string | null;
  event_team: string | null;
  message: string;
  timestamp: string;
  odds: {
    home_win: number;
    draw: number;
    away_win: number;
  };
}

/** Create a WebSocket server on port 9000 */
const wss = new WebSocketServer({ port: 9000 });
console.log('Live Game Simulation server running on ws://localhost:9000');

/** Set total match length to 12 simulated minutes to allow more updates */
const TOTAL_GAME_MINUTES = 12;

/** Master list of games */
const games: Game[] = [];

/**
 * Broadcast helper function
 */
function broadcast<T>(data: T): void {
  console.log('Broadcasting data:', data);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

/**
 * Creates a new scheduled game with initial odds.
 */
function createNewGame(delayMs: number): void {
  const gameId = 'G' + Math.floor(Math.random() * 10000);
  const homeTeam = 'Team' + Math.floor(Math.random() * 50);
  const awayTeam = 'Team' + Math.floor(Math.random() * 50);

  const newGame: Game = {
    game_id: gameId,
    home_team: homeTeam,
    away_team: awayTeam,
    score: '0-0',
    status: 'scheduled',
    minute: 0,
    startTime: Date.now() + delayMs,
    odds: {
      home_win: parseFloat((Math.random() * (3.5 - 1.5) + 1.5).toFixed(2)), // Random 1.5 - 3.5
      draw: parseFloat((Math.random() * (3.0 - 2.0) + 2.0).toFixed(2)), // Random 2.0 - 3.0
      away_win: parseFloat((Math.random() * (3.5 - 1.5) + 1.5).toFixed(2)), // Random 1.5 - 3.5
    }
  };

  games.push(newGame);
  console.log(
    `Scheduled new game: ${homeTeam} vs ${awayTeam} (ID: ${gameId}), starts at ${new Date(newGame.startTime).toISOString()}`
  );
}

/**
 * Randomly increment a game's current minute (1–2 "minutes" per update).
 */
function progressGameMinute(game: Game): void {
  const increment = Math.floor(Math.random() * 2) + 1; // 1..2 minutes per cycle
  game.minute += increment;
}

/**
 * Updates odds dynamically based on game events.
 */
function updateOdds(game: Game, event: string | null) {
  if (event === 'goal') {
    const [homeGoals, awayGoals] = game.score.split('-').map(Number);

    if (homeGoals > awayGoals) {
      game.odds.home_win = Math.max(1.20, game.odds.home_win - 0.3);
      game.odds.away_win = Math.min(5.0, game.odds.away_win + 0.5);
    } else if (awayGoals > homeGoals) {
      game.odds.away_win = Math.max(1.20, game.odds.away_win - 0.3);
      game.odds.home_win = Math.min(5.0, game.odds.home_win + 0.5);
    } else {
      game.odds.draw = Math.max(1.50, game.odds.draw - 0.2);
    }
  }

  if (game.minute >= 80 && game.score === '0-0') {
    game.odds.draw = Math.min(1.80, game.odds.draw + 0.4);
  }
}

/**
 * Randomly determine an event (goal, red card, yellow card, or no_event).
 */
function determineRandomEvent(game: Game) {
  const eventTypes = ['goal', 'red_card', 'yellow_card', 'no_event'] as const;
  const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  let [homeGoals, awayGoals] = game.score.split('-').map(Number);

  switch (randomEvent) {
    case 'goal': {
      const scoringTeam = Math.random() > 0.5 ? 'home' : 'away';
      if (scoringTeam === 'home') {
        homeGoals++;
        return {
          event: 'goal',
          event_team: game.home_team,
          message: `${game.home_team} scored!`,
          updatedScore: `${homeGoals}-${awayGoals}`,
        };
      } else {
        awayGoals++;
        return {
          event: 'goal',
          event_team: game.away_team,
          message: `${game.away_team} scored!`,
          updatedScore: `${homeGoals}-${awayGoals}`,
        };
      }
    }
    case 'red_card':
      return {
        event: 'red_card',
        event_team: Math.random() > 0.5 ? game.home_team : game.away_team,
        message: 'A player received a Red Card!',
        updatedScore: game.score,
      };
    case 'yellow_card':
      return {
        event: 'yellow_card',
        event_team: Math.random() > 0.5 ? game.home_team : game.away_team,
        message: 'A player received a Yellow Card!',
        updatedScore: game.score,
      };
    default: // 'no_event'
      return {
        event: null,
        event_team: null,
        message: 'No significant event',
        updatedScore: game.score,
      };
  }
}

/**
 * Main simulation loop (runs every 5 seconds).
 */
setInterval(() => {
  games.forEach((game) => {
    if (game.status === 'scheduled' && Date.now() >= game.startTime) {
      game.status = 'in_progress';
      broadcast({
        game_id: game.game_id,
        status: 'in_progress',
        message: `Game ${game.game_id} has started!`,
        timestamp: new Date().toISOString(),
      });
    }

    if (game.status === 'in_progress') {
      progressGameMinute(game);
      const { event, event_team, message, updatedScore } = determineRandomEvent(game);
      game.score = updatedScore;
      updateOdds(game, event);

      const payload: GameUpdatePayload = {
        game_id: game.game_id,
        home_team: game.home_team,
        away_team: game.away_team,
        score: game.score,
        status: game.status,
        minute: game.minute,
        event,
        event_team,
        message,
        timestamp: new Date().toISOString(),
        odds: game.odds,
      };
      broadcast(payload);

      if (game.minute >= TOTAL_GAME_MINUTES) {
        game.status = 'finished';
        const finishPayload: GameUpdatePayload = {
          game_id: game.game_id,
          home_team: game.home_team,
          away_team: game.away_team,
          score: game.score,
          status: game.status,
          minute: game.minute,
          event: null,
          event_team: null,
          message: `Game finished at ${game.score}`,
          timestamp: new Date().toISOString(),
          odds: game.odds,
        };
        broadcast(finishPayload);
      }
    }
  });
}, 5000);

/** Generate initial batch of scheduled games */
for (let i = 0; i < 3; i++) {
  createNewGame(Math.floor(Math.random() * 15_000) + 5_000);
}

/** Continuously add new scheduled games every 30 seconds */
setInterval(() => {
  for (let i = 0; i < 2; i++) {
    createNewGame(Math.floor(Math.random() * 30_000) + 15_000);
  }
}, 30_000);

/** Handle WebSocket connections */
wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected.');
  ws.send(JSON.stringify({ type: 'initial_state', data: games }));
});
