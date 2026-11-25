class ZoneNetwork {
  constructor() {
    this.myId = 'player_' + Math.random().toString(36).slice(2, 9);
    this.room = null;
    this.peers = new Set();
    this.isHost = true;
    this.sendMove = null;
    this.sendCapture = null;
    this.handlers = {
      onPlayerUpdate: () => {},
      onPlayerCapture: () => {},
      onPlayerLeave: () => {},
      onOnlineChange: () => {}
    };
  }

  async connect(callbacks) {
    this.handlers = { ...this.handlers, ...callbacks };
    this.handlers.onOnlineChange(1);

    try {
      const mod = await import('https://esm.sh');
      this.myId = mod.selfId;
      this.room = mod.joinRoom({ appId: 'zonerush-global-arena-v1' }, 'main-public-arena');

      const [sendMove, getMove] = this.room.makeAction('move');
      const [sendCapture, getCapture] = this.room.makeAction('capture');
      this.sendMove = sendMove;
      this.sendCapture = sendCapture;

      this.room.onPeerJoin((peerId) => {
        this.peers.add(peerId);
        this.recalculateHost();
        this.handlers.onOnlineChange(this.peers.size + 1);
      });

      this.room.onPeerLeave((peerId) => {
        this.peers.delete(peerId);
        this.recalculateHost();
        this.handlers.onPlayerLeave(peerId);
        this.handlers.onOnlineChange(this.peers.size + 1);
      });

      getMove((data, peerId) => this.handlers.onPlayerUpdate(peerId, data));
      getCapture((data, peerId) => this.handlers.onPlayerCapture(peerId, data));
    } catch (err) {
      console.warn('Офлайн режим с ботами:', err);
    }
  }

  recalculateHost() {
    const allIds = [this.myId, ...Array.from(this.peers)].sort();
    this.isHost = allIds.at(0) === this.myId;
  }

  broadcastMove(playerData) {
    if (this.sendMove && this.peers.size > 0) this.sendMove(playerData);
  }

  broadcastCapture(cells, ownerId) {
    if (this.sendCapture && this.peers.size > 0) this.sendCapture({ cells, ownerId });
  }
}

window.ZoneNet = new ZoneNetwork();
