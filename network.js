import { joinRoom, selfId } from 'https://esm.sh';

const APP_ID = 'zonerush-global-arena-v1';
const ROOM_ID = 'main-public-arena';

class ZoneNetwork {
  constructor() {
    this.myId = selfId;
    this.room = null;
    this.peers = new Set();
    this.isHost = true;

    this.sendMove = null;
    this.sendCapture = null;
    this.sendKill = null;
    this.sendWorldSync = null;

    this.handlers = {
      onPlayerUpdate: () => {},
      onPlayerCapture: () => {},
      onPlayerKill: () => {},
      onPlayerLeave: () => {},
      onWorldSync: () => {},
      onOnlineChange: () => {}
    };
  }

  connect(callbacks) {
    this.handlers = { ...this.handlers, ...callbacks };

    try {
      this.room = joinRoom({ appId: APP_ID }, ROOM_ID);

      const [sendMove, getMove] = this.room.makeAction('move');
      const [sendCapture, getCapture] = this.room.makeAction('capture');
      const [sendKill, getKill] = this.room.makeAction('kill');
      const [sendWorldSync, getWorldSync] = this.room.makeAction('sync');

      this.sendMove = sendMove;
      this.sendCapture = sendCapture;
      this.sendKill = sendKill;
      this.sendWorldSync = sendWorldSync;

      // Подключение нового живого игрока к общей арене
      this.room.onPeerJoin((peerId) => {
        this.peers.add(peerId);
        this.recalculateHost();
        this.handlers.onOnlineChange(this.peers.size + 1);

        // Если мы сейчас лидер арены — отправляем новичку текущее состояние карты
        if (this.isHost && this.handlers.getFullWorldState) {
          const snapshot = this.handlers.getFullWorldState();
          if (snapshot) {
            this.sendWorldSync(snapshot, peerId);
          }
        }
      });

      // Выход игрока с арены
      this.room.onPeerLeave((peerId) => {
        this.peers.delete(peerId);
        this.recalculateHost();
        this.handlers.onPlayerLeave(peerId);
        this.handlers.onOnlineChange(this.peers.size + 1);
      });

      // Получение координат и шлейфов от других игроков
      getMove((data, peerId) => {
        this.handlers.onPlayerUpdate(peerId, data);
      });

      // Получение события захвата территории
      getCapture((data, peerId) => {
        this.handlers.onPlayerCapture(peerId, data);
      });

      // Получение события смерти/килла
      getKill((data, peerId) => {
        this.handlers.onPlayerKill(peerId, data);
      });

      // Синхронизация карты при входе в активную арену
      getWorldSync((snapshot) => {
        this.handlers.onWorldSync(snapshot);
      });

      this.recalculateHost();
      this.handlers.onOnlineChange(1);
    } catch (err) {
      console.warn('P2P сеть недоступна, запуск в режиме арены с ботами:', err);
      this.isHost = true;
      this.handlers.onOnlineChange(1);
    }
  }

  // Детерминированный выбор лидера арены (игрок с наименьшим ID)
  recalculateHost() {
    const allIds = [this.myId, ...Array.from(this.peers)].sort();
    this.isHost = allIds === this.myId;
  }

  broadcastMove(playerData) {
    if (this.sendMove && this.peers.size > 0) {
      this.sendMove(playerData);
    }
  }

  broadcastCapture(cells, ownerId) {
    if (this.sendCapture && this.peers.size > 0) {
      this.sendCapture({ cells, ownerId });
    }
  }

  broadcastKill(victimId, killerId) {
    if (this.sendKill && this.peers.size > 0) {
      this.sendKill({ victimId, killerId });
    }
  }
}

window.ZoneNet = new ZoneNetwork();
