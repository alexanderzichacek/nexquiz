import type {
  ExplanationShowEvent,
  GameFinishedEvent,
  LeaderboardEvent,
  LobbyPlayersEvent,
  PageShowEvent,
  PlayerResultEvent,
  QuestionEndEvent,
  QuestionProgressEvent,
  QuestionRevealEvent,
  QuestionStartEvent,
} from "@nexquiz/shared";
import type { GameNotifier } from "../game/ports.js";
import { gameRoom, hostRoom, playerRoom, type HostNamespace, type PlayNamespace } from "./types.js";

/** `GameNotifier` over Socket.IO rooms. Emits are dropped until `bind()`. */
export class SocketNotifier implements GameNotifier {
  private host: HostNamespace | null = null;
  private play: PlayNamespace | null = null;

  bind(host: HostNamespace, play: PlayNamespace): void {
    this.host = host;
    this.play = play;
  }

  lobbyPlayers(pin: string, event: LobbyPlayersEvent): void {
    this.host?.to(gameRoom(pin)).emit("lobby:players", event);
    this.play?.to(gameRoom(pin)).emit("lobby:players", event);
  }

  questionStart(pin: string, event: { host: QuestionStartEvent; players: QuestionStartEvent }): void {
    this.host?.to(gameRoom(pin)).emit("question:start", event.host);
    this.play?.to(gameRoom(pin)).emit("question:start", event.players);
  }

  pageShow(pin: string, event: PageShowEvent): void {
    this.host?.to(gameRoom(pin)).emit("page:show", event);
    this.play?.to(gameRoom(pin)).emit("page:show", event);
  }

  explanationShow(pin: string, event: { host: ExplanationShowEvent; players: ExplanationShowEvent }): void {
    this.host?.to(gameRoom(pin)).emit("explanation:show", event.host);
    this.play?.to(gameRoom(pin)).emit("explanation:show", event.players);
  }

  questionProgress(pin: string, event: QuestionProgressEvent): void {
    this.host?.to(hostRoom(pin)).emit("question:progress", event);
  }

  questionEnd(pin: string, event: QuestionEndEvent): void {
    this.host?.to(gameRoom(pin)).emit("question:end", event);
    this.play?.to(gameRoom(pin)).emit("question:end", event);
  }

  questionReveal(pin: string, event: QuestionRevealEvent): void {
    this.host?.to(hostRoom(pin)).emit("question:reveal", event);
  }

  playerResult(pin: string, playerId: string, event: PlayerResultEvent): void {
    this.play?.to(playerRoom(pin, playerId)).emit("player:result", event);
  }

  leaderboard(pin: string, event: LeaderboardEvent): void {
    this.host?.to(gameRoom(pin)).emit("leaderboard", event);
    this.play?.to(gameRoom(pin)).emit("leaderboard", event);
  }

  gameFinished(pin: string, event: GameFinishedEvent): void {
    this.host?.to(gameRoom(pin)).emit("game:finished", event);
    this.play?.to(gameRoom(pin)).emit("game:finished", event);
  }

  playerKicked(pin: string, playerId: string): void {
    if (!this.play) return;
    const room = playerRoom(pin, playerId);
    this.play.to(room).emit("player:kicked");
    this.play.in(room).socketsLeave([gameRoom(pin), room]);
  }
}
