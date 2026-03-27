import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProjectorState } from '@/types/projector';

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
 * Projector sync — uses Supabase Realtime broadcast (Internet only).
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
  onRequestState?: () => void,
) {
  const [cloudConnected, setCloudConnected] = useState(false);
  const [roomId, setRoomId] = useState(getOrCreateRoom);
  const [isRoomOwner, setIsRoomOwner] = useState(getIsRoomOwner);
  const onStateReceivedRef = useRef(onStateReceived);
  const onControlReceivedRef = useRef(onControlReceived);
  const onRequestStateRef = useRef(onRequestState);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Prevent echo: ignore control messages we just sent (Set with TTL)
  const recentSentIds = useRef(new Set<string>());
  const addSentId = (id: string) => {
    recentSentIds.current.add(id);
    setTimeout(() => recentSentIds.current.delete(id), 5000);
  };
  const wasSentByUs = (id: string | undefined) => id ? recentSentIds.current.has(id) : false;

  useEffect(() => { onStateReceivedRef.current = onStateReceived; }, [onStateReceived]);
  useEffect(() => { onControlReceivedRef.current = onControlReceived; }, [onControlReceived]);
  useEffect(() => { onRequestStateRef.current = onRequestState; }, [onRequestState]);

  // ─── Supabase Realtime broadcast (Internet) ───
  useEffect(() => {
    const channelName = `${CHANNEL_PREFIX}:${roomId}`;
    console.log(`[ProjectorSync] Subscribing to channel "${channelName}" as ${mode}`);

    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false, ack: true } },
    });

    channel
      .on('broadcast', { event: 'projector-state' }, (payload) => {
        if (mode === 'display' && onStateReceivedRef.current && payload.payload) {
          console.log(`[ProjectorSync] Display received state`);
          onStateReceivedRef.current(payload.payload as ProjectorSyncState);
        }
      })
      .on('broadcast', { event: 'projector-control' }, (payload) => {
        if (mode === 'controller' && onControlReceivedRef.current && payload.payload) {
          const data = payload.payload as { state: ProjectorState; msgId: string };
          if (wasSentByUs(data.msgId)) return;
          console.log(`[ProjectorSync] Controller received control sync`);
          onControlReceivedRef.current(data.state);
        }
      })
      .on('broadcast', { event: 'request-state' }, () => {
        // Another controller joined and is requesting current state
        if (mode === 'controller' && onRequestStateRef.current) {
          console.log(`[ProjectorSync] Received state request from new joiner`);
          onRequestStateRef.current();
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
  }, [roomId, mode]);

  // ─── Send display state (for projector screen) ───
  const sendState = useCallback(async (state: ProjectorSyncState) => {
    const channel = channelRef.current;
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'projector-state',
        payload: state,
      });
    }
  }, []);

  // ─── Send control state (for other controllers) ───
  const sendControlState = useCallback(async (controlState: ProjectorState) => {
    const channel = channelRef.current;
    if (channel) {
      const msgId = crypto.randomUUID();
      addSentId(msgId);
      await channel.send({
        type: 'broadcast',
        event: 'projector-control',
        payload: { state: controlState, msgId },
      });
    }
  }, []);

  const changeRoom = useCallback((newRoom: string) => {
    const clean = newRoom.trim().replace(/[^0-9]/g, '').slice(0, 4);
    if (clean.length === 4) {
      localStorage.setItem(ROOM_KEY, clean);
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
    connected: cloudConnected,
    cloudConnected,
    sendState,
    sendControlState,
    roomId,
    isRoomOwner,
    changeRoom,
    generateNewRoom,
  };
}
