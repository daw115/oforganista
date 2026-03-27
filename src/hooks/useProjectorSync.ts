import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectorState } from '@/types/projector';
import type { LANCommand, LANBridgeState } from '@/types/lanBridge';

export interface ProjectorSyncSettings {
  fontSize?: number;
  textColor?: string; // resolved hex
  strokeWidth?: number;
  background?: string;
  shadowIntensity?: number;
  rotation?: number;
  maxLines?: number;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
}

export interface ProjectorSyncState {
  text: string;
  isLive: boolean;
  title?: string;
  settings?: ProjectorSyncSettings;
}

const CHANNEL_PREFIX = 'projector-sync';
const ROOM_KEY = 'organista_projector_room';
const ROOM_OWNER_KEY = 'organista_projector_room_owner';

function getOrCreateRoom(): string {
  let room = localStorage.getItem(ROOM_KEY);
  if (!room || !/^\d{4}$/.test(room)) {
    room = String(Math.floor(1000 + Math.random() * 9000));
    localStorage.setItem(ROOM_KEY, room);
    localStorage.setItem(ROOM_OWNER_KEY, 'true');
  }
  return room;
}

function getIsRoomOwner(): boolean {
  return localStorage.getItem(ROOM_OWNER_KEY) !== 'false';
}

/**
 * Projector sync — uses WebSocket (LAN) + Supabase Realtime broadcast (Internet).
 * 
 * mode = 'controller': sends state updates AND listens for control sync from other controllers
 * mode = 'display': receives display state updates
 * 
 * roomId: shared code that links controller and display (shown in UI)
 */
export function useProjectorSync(
  mode: 'controller' | 'display',
  onStateReceived?: (state: ProjectorSyncState) => void,
  onControlReceived?: (state: ProjectorState) => void,
  onLanCommandReceived?: (cmd: LANCommand) => void,
  onLanStateReceived?: (state: LANBridgeState) => void,
  channelSuffix?: string,
  onRequestState?: () => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const [wsConnected, setWsConnected] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [roomId, setRoomId] = useState(getOrCreateRoom);
  const [isRoomOwner, setIsRoomOwner] = useState(getIsRoomOwner);
  const onStateReceivedRef = useRef(onStateReceived);
  const onControlReceivedRef = useRef(onControlReceived);
  const onLanCommandReceivedRef = useRef(onLanCommandReceived);
  const onLanStateReceivedRef = useRef(onLanStateReceived);
  const onRequestStateRef = useRef(onRequestState);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Prevent echo: ignore control messages we just sent
  const lastSentControlId = useRef<string | null>(null);
  const lastSentLanCmdId = useRef<string | null>(null);

  useEffect(() => { onStateReceivedRef.current = onStateReceived; }, [onStateReceived]);
  useEffect(() => { onControlReceivedRef.current = onControlReceived; }, [onControlReceived]);
  useEffect(() => { onLanCommandReceivedRef.current = onLanCommandReceived; }, [onLanCommandReceived]);
  useEffect(() => { onLanStateReceivedRef.current = onLanStateReceived; }, [onLanStateReceived]);
  useEffect(() => { onRequestStateRef.current = onRequestState; }, [onRequestState]);

  // ─── WebSocket (LAN) ───
  const getWsUrl = useCallback(() => {
    if (window.location.protocol === 'https:') return null;
    return `ws://${window.location.host}/ws-projector`;
  }, []);

  const connectWs = useCallback(() => {
    const url = getWsUrl();
    if (!url) return;

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setWsConnected(true);
        wsRef.current = ws;
      };

      ws.onmessage = (e) => {
        if (mode === 'display' && onStateReceivedRef.current) {
          try {
            onStateReceivedRef.current(JSON.parse(e.data));
          } catch {}
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connectWs, 2000);
      };

      ws.onerror = () => ws.close();
    } catch {}
  }, [getWsUrl, mode]);

  useEffect(() => {
    connectWs();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // ─── Supabase Realtime broadcast (Internet) ───
  useEffect(() => {
    const channelName = `${CHANNEL_PREFIX}:${roomId}${channelSuffix ? `:${channelSuffix}` : ''}`;
    console.log(`[ProjectorSync] Subscribing to channel "${channelName}" as ${mode}`);
    
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: true } },
    });

    channel
      .on('broadcast', { event: 'projector-state' }, (payload) => {
        if (mode === 'display' && onStateReceivedRef.current && payload.payload) {
          console.log(`[ProjectorSync] Display received state:`, payload.payload);
          onStateReceivedRef.current(payload.payload as ProjectorSyncState);
        }
      })
      .on('broadcast', { event: 'projector-control' }, (payload) => {
        if (mode === 'controller' && onControlReceivedRef.current && payload.payload) {
          const data = payload.payload as { state: ProjectorState; msgId: string };
          if (data.msgId && data.msgId === lastSentControlId.current) return;
          console.log(`[ProjectorSync] Controller received control sync`);
          onControlReceivedRef.current(data.state);
        }
      })
      .on('broadcast', { event: 'request-state' }, (payload) => {
        // Another controller joined and is requesting current state
        if (mode === 'controller' && onRequestStateRef.current) {
          console.log(`[ProjectorSync] Received state request from new joiner`);
          onRequestStateRef.current();
        }
      })
      .on('broadcast', { event: 'lan-command' }, (payload) => {
        // LAN commands — bridge listens for these and executes on OpenLP
        if (onLanCommandReceivedRef.current && payload.payload) {
          const cmd = payload.payload as LANCommand;
          if (cmd.msgId && cmd.msgId === lastSentLanCmdId.current) return;
          console.log(`[ProjectorSync] Received LAN command:`, cmd.type, cmd.index, cmd.title);
          onLanCommandReceivedRef.current(cmd);
        }
      })
      .on('broadcast', { event: 'lan-state' }, (payload) => {
        // LAN state — remote controllers listen for bridge state updates
        if (onLanStateReceivedRef.current && payload.payload) {
          console.log(`[ProjectorSync] Received LAN state from bridge`);
          onLanStateReceivedRef.current(payload.payload as LANBridgeState);
        }
      })
      .subscribe((status) => {
        console.log(`[ProjectorSync] Channel status: ${status}`);
        setCloudConnected(status === 'SUBSCRIBED');
        
        // When a controller joins a channel, request state from existing controllers
        if (status === 'SUBSCRIBED' && mode === 'controller') {
          setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'request-state',
              payload: { requesterId: crypto.randomUUID() },
            });
            console.log(`[ProjectorSync] Sent state request to existing controllers`);
          }, 300);
        }
      });

    channelRef.current = channel;

    return () => {
      console.log(`[ProjectorSync] Unsubscribing from "${channelName}"`);
      supabase.removeChannel(channel);
      channelRef.current = null;
      setCloudConnected(false);
    };
  }, [roomId, mode, channelSuffix]);

  // ─── Send display state (for projector screen) ───
  const sendState = useCallback(async (state: ProjectorSyncState) => {
    // WebSocket (LAN)
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(state));
    }

    // Supabase broadcast
    const channel = channelRef.current;
    if (channel) {
      const result = await channel.send({
        type: 'broadcast',
        event: 'projector-state',
        payload: state,
      });
      console.log('[ProjectorSync] Display broadcast sent, result:', result);
    }
  }, []);

  // ─── Send control state (for other controllers) ───
  const sendControlState = useCallback(async (controlState: ProjectorState) => {
    const channel = channelRef.current;
    if (channel) {
      const msgId = crypto.randomUUID();
      lastSentControlId.current = msgId;
      const result = await channel.send({
        type: 'broadcast',
        event: 'projector-control',
        payload: { state: controlState, msgId },
      });
      console.log('[ProjectorSync] Control broadcast sent, result:', result);
    }
  }, []);

  // ─── Send LAN command (remote → bridge) ───
  const sendLanCommand = useCallback(async (type: LANCommand['type'], index?: number, title?: string) => {
    const channel = channelRef.current;
    if (channel) {
      const msgId = crypto.randomUUID();
      lastSentLanCmdId.current = msgId;
      const cmd: LANCommand = { type, index, title, msgId };
      await channel.send({ type: 'broadcast', event: 'lan-command', payload: cmd });
      console.log('[ProjectorSync] LAN command sent:', type, index, title);
    }
  }, []);

  // ─── Send LAN state (bridge → remotes) ───
  const sendLanState = useCallback(async (lanState: LANBridgeState) => {
    const channel = channelRef.current;
    if (channel) {
      await channel.send({ type: 'broadcast', event: 'lan-state', payload: lanState });
    }
  }, []);

  const changeRoom = useCallback((newRoom: string) => {
    const clean = newRoom.trim().replace(/[^0-9]/g, '').slice(0, 4);
    if (clean.length === 4) {
      localStorage.setItem(ROOM_KEY, clean);
      // Preserve owner flag if already set by caller (e.g. createRoom sets it before calling changeRoom)
      const currentOwnerFlag = localStorage.getItem(ROOM_OWNER_KEY);
      if (currentOwnerFlag !== 'true') {
        localStorage.setItem(ROOM_OWNER_KEY, 'false');
      }
      setRoomId(clean);
      setIsRoomOwner(localStorage.getItem(ROOM_OWNER_KEY) === 'true');
    }
  }, []);

  const generateNewRoom = useCallback(() => {
    const newRoom = String(Math.floor(1000 + Math.random() * 9000));
    localStorage.setItem(ROOM_KEY, newRoom);
    localStorage.setItem(ROOM_OWNER_KEY, 'true');
    setRoomId(newRoom);
    setIsRoomOwner(true);
  }, []);

  return {
    connected: wsConnected || cloudConnected,
    wsConnected,
    cloudConnected,
    sendState,
    sendControlState,
    sendLanCommand,
    sendLanState,
    roomId,
    isRoomOwner,
    changeRoom,
    generateNewRoom,
  };
}
