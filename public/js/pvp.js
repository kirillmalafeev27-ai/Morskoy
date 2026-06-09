class PvpSessionClient {
  constructor() {
    this.sessionId = null;
    this.playerToken = null;
    this.role = null;
    this.session = null;
    this.eventSource = null;
    this.listeners = new Set();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit() {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }

  get isActive() {
    return Boolean(this.sessionId && this.playerToken);
  }

  async createSession(playerName, preferredRole) {
    const data = await this._post('/api/pvp/sessions', { playerName, preferredRole });
    this._bindSession(data);
    return data.session;
  }

  async joinSession(sessionId, playerName, preferredRole) {
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(sessionId)}/join`, {
      playerName,
      preferredRole,
    });
    this._bindSession(data);
    return data.session;
  }

  async updateSetup(patch) {
    if (!this.isActive) return null;
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/setup`, {
      playerToken: this.playerToken,
      patch,
    });
    this._applySession(data.session);
    return data.session;
  }

  async setReady(ready) {
    if (!this.isActive) return null;
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/ready`, {
      playerToken: this.playerToken,
      ready,
    });
    this._applySession(data.session);
    return data.session;
  }

  async leaveSession() {
    if (!this.isActive) return;
    try {
      await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/leave`, {
        playerToken: this.playerToken,
      });
    } finally {
      this._disconnectStream();
      this.sessionId = null;
      this.playerToken = null;
      this.role = null;
      this.session = null;
      this._emit();
    }
  }

  async initGame(payload) {
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/game/init`, {
      playerToken: this.playerToken,
      payload,
    });
    this._applySession(data.session);
    return data.session;
  }

  async submitAnswer(slotId, correct) {
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/game/answer`, {
      playerToken: this.playerToken,
      slotId,
      correct,
    });
    this._applySession(data.session);
    return data;
  }

  async move(direction) {
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/game/move`, {
      playerToken: this.playerToken,
      direction,
    });
    this._applySession(data.session);
    return data;
  }

  async restartGame() {
    if (!this.isActive) return null;
    const data = await this._post(`/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/game/restart`, {
      playerToken: this.playerToken,
    });
    this._applySession(data.session);
    return data.session;
  }

  _bindSession(data) {
    this._disconnectStream();
    this.sessionId = data.sessionId;
    this.playerToken = data.playerToken;
    this.role = data.role;
    this.session = data.session || null;
    this._emit();
    this._connectStream();
  }

  _applySession(session) {
    if (!session) return;
    this.session = session;
    this.role = session.viewerRole || this.role;
    this._emit();
  }

  _connectStream() {
    if (!this.isActive) return;
    const url = `/api/pvp/sessions/${encodeURIComponent(this.sessionId)}/stream?token=${encodeURIComponent(this.playerToken)}`;
    this.eventSource = new EventSource(url);
    this.eventSource.onmessage = (event) => {
      try {
        const session = JSON.parse(event.data);
        this._applySession(session);
      } catch (err) {
        console.warn('Failed to parse PVP session update:', err);
      }
    };
    this.eventSource.onerror = () => {
      // EventSource reconnects automatically; keep the last known state.
    };
  }

  _disconnectStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  async _post(url, body) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });

    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    if (!resp.ok) {
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }

    return data;
  }
}
