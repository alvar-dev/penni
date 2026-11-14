import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Drawer, DRAWER_TIMING } from './src/components/Drawer';
import { NewChatIcon, PersonIcon, SpeakerIcon } from './src/components/Icon';
import { KokoroEngine, useSpeaker } from './src/tts/useSpeaker';
import { Orb, ORB_CANVAS, ORB_DIAMETER } from './src/components/Orb';

import { ask, AskError, getSummary, transcribe } from './src/api';
import { HomeOverview } from './src/components/HomeOverview';
import { Viz } from './src/components/Viz';
import { ListeningTime, Waveform } from './src/components/Waveform';
import { newId, personas, placeholderAnswer, strings, suggestions, type Message } from './src/content';
import { loadConversations, saveConversations, titleFrom, type Conversation } from './src/conversations';
import { loadPlans, savePlans, type Plan } from './src/plan';
import { loadConnected, saveConnected } from './src/banks';
import { ConnectSheet } from './src/components/ConnectSheet';
import { bankById, OTHER_BANKS, type OtherBankInfo } from './src/shared/banks';
import type { Summary } from './src/shared/api';
import { useVoiceInput } from './src/hooks/useVoiceInput';
import { colors, type } from './src/theme';

/** The character in the middle of the screen (src/components/Dog.tsx is a tried, unused alternative). */
const Mascot: typeof Orb = Orb;

type Phase = 'idle' | 'listening' | 'transcribing' | 'thinking';
type OrbMode = 'hero' | 'heroCompact' | 'listen' | 'dock' | 'dockListen' | 'dockHidden';

const INPUT_ROW = 64;
/** In a conversation the orb lives inside the input field, so the bottom sheet is just the input row. */
const DOCK_SHEET = INPUT_ROW;
/** The orb's place at the right end of the input field. */
const SLOT = 40;
const FIELD_PAD_RIGHT = 4;
const FIELD_HEIGHT = 48;
/** The field grows to five lines of text (about 20 pt each), then scrolls. */
const INPUT_MAX = SLOT + 4 * 20.5;
const FADE = 36;
const HEADER = 52;
/** How far below the header the conversation fades out as it scrolls up. */
const TOP_FADE = 28;

/** Share of the orb canvas that takes part in layout; the halo and shadow overflow it. */
const FOOTPRINT = 0.62;
/** The dog is wider than the orb, so it is drawn a little smaller to fit inside the input field. */
const DOCK_FIT = Mascot === Orb ? 1 : 0.78;
const ORB_SCALE: Record<OrbMode, number> = {
  hero: 0.5,
  heroCompact: 0.36,
  listen: 1,
  dock: 0.155 * DOCK_FIT,
  dockListen: 0.165 * DOCK_FIT,
  dockHidden: 0.001,
};
const ORB_SPRING = { damping: 20, stiffness: 150, mass: 0.9 };

/** Replaces {name} placeholders in a string. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** Under a surprise-fund answer: switch the suggested plan on (or off). */
function PlanButton({ monthly, date, active, onStart, onStop }: { monthly: number; date: string; active: boolean; onStart: () => void; onStop: () => void }) {
  return active ? (
    <View style={styles.planRow}>
      <View style={styles.planOn}>
        <Text style={styles.planOnText}>✓ {fill(strings.planOn, { amount: monthly, date })}</Text>
      </View>
      <Pressable onPress={onStop} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.planStop}>{strings.planStop}</Text>
      </Pressable>
    </View>
  ) : (
    <Pressable
      onPress={onStart}
      accessibilityRole="button"
      style={({ pressed }) => [styles.planButton, pressed && styles.planButtonPressed]}>
      <Text style={styles.planButtonText}>{fill(strings.planStart, { amount: monthly })}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Screen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Screen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [micNote, setMicNote] = useState<string | null>(null);
  /** A short message above the input; `retry` offers to listen again. */
  const [notice, setNotice] = useState<{ text: string; retry?: boolean } | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [personaId, setPersonaId] = useState(personas[0].id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const historyLoaded = useRef(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  // Customers who connected another bank (PSD2); the coach then sees every account.
  const [banks, setBanks] = useState<Record<string, string[]>>({});
  const banksLoaded = useRef(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const connectedBanks = useMemo(
    () => (banks[personaId] ?? []).map(bankById).filter((b): b is OtherBankInfo => b !== undefined),
    [banks, personaId],
  );
  const bankIds = useMemo(() => connectedBanks.map((b) => b.id).sort(), [connectedBanks]);
  const bankKey = bankIds.join(',');
  const canConnectMore = connectedBanks.length < OTHER_BANKS.length;
  const plansLoaded = useRef(false);
  const [thinkingStep, setThinkingStep] = useState(0);

  const level = useSharedValue(0);
  const energy = useSharedValue(0);
  const scale = useSharedValue(ORB_SCALE.hero);
  const orbX = useSharedValue(0);
  const orbY = useSharedValue(0);
  const expand = useSharedValue(1);
  const areaHeight = useSharedValue(0);
  // How much taller than one line the input field has grown; long questions wrap upwards.
  const [inputExtra, setInputExtra] = useState(0);
  const [inputHeight, setInputHeight] = useState(SLOT);
  const inputExtraSV = useSharedValue(0);
  const drawer = useSharedValue(0);

  // Set below; the voice hook calls it when it hears the end of a question.
  const finishRef = useRef<() => void>(() => {});
  const onAutoStop = useCallback(() => finishRef.current(), []);
  const mic = useVoiceInput(level, onAutoStop);
  // Answers are always shown as text; the voice reads them unless muted.
  const speaker = useSpeaker();
  const waveHistory = mic.history;
  const listRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // Each question gets a number; an answer that arrives after the conversation
  // was reset (new chat, other customer) carries an old number and is dropped.
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const empty = messages.length === 0;
  const listening = phase === 'listening';
  const voiceActive = listening || phase === 'transcribing';
  // Only the empty start screen is full height. In a conversation the orb
  // listens where it is, inside the input field.
  const expanded = empty;
  const docked = !empty;
  const mode: OrbMode = empty
    ? voiceActive
      ? 'listen'
      : keyboardOpen
        ? 'heroCompact'
        : 'hero'
    : voiceActive
      ? 'dockListen'
      : draft.trim()
        ? 'dockHidden'
        : 'dock';
  const maxScale = Math.min(1, width / 420);
  const persona = personas.find((item) => item.id === personaId) ?? personas[0];
  const visibleConversations = useMemo(() => conversations.filter((c) => c.personaId === personaId), [conversations, personaId]);
  const drawerWidth = Math.min(320, Math.round(width * 0.84));

  // The orb is one element: it shrinks into the dock when a conversation starts
  // and rises back to the centre while it listens.
  useEffect(() => {
    scale.set(withSpring(Math.min(ORB_SCALE[mode], maxScale), ORB_SPRING));
    expand.set(withTiming(expanded ? 1 : 0, { duration: 420, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
    // Docked: from the middle of the (now zero-height) stage into the field's right end.
    orbX.set(withSpring(docked ? width / 2 - (16 + FIELD_PAD_RIGHT + SLOT / 2) : 0, ORB_SPRING));
    orbY.set(withSpring(docked ? INPUT_ROW / 2 + inputExtra : 0, ORB_SPRING));
  }, [mode, expanded, docked, maxScale, width, scale, expand, orbX, orbY, inputExtra]);

  useEffect(() => {
    if (phase === 'thinking' || phase === 'transcribing') {
      energy.set(withTiming(1, { duration: 300 }));
      level.set(withRepeat(
        withSequence(withTiming(0.3, { duration: 520 }), withTiming(0.06, { duration: 520 })),
        -1,
      ));
    } else if (phase === 'listening') {
      energy.set(withTiming(1, { duration: 300 }));
    } else if (speaker.speakingId) {
      // Speaking: the orb pulses softly with the voice.
      energy.set(withTiming(0.8, { duration: 300 }));
      level.set(withRepeat(withSequence(withTiming(0.24, { duration: 360 }), withTiming(0.08, { duration: 420 })), -1));
    } else {
      cancelAnimation(level);
      level.set(withTiming(0, { duration: 350 }));
      energy.set(withTiming(0, { duration: 600 }));
    }
  }, [phase, energy, level, speaker.speakingId]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardOpen(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Charts measure themselves after they mount, so the conversation keeps
  // scrolling to the end for a moment after each new message.
  const followEnd = useRef(false);
  useEffect(() => {
    followEnd.current = true;
    const scroll = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    const release = setTimeout(() => (followEnd.current = false), 1500);
    return () => {
      clearTimeout(scroll);
      clearTimeout(release);
    };
  }, [messages.length, phase]);

  const cancelRequest = useCallback(() => {
    requestSeq.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  // The start screen's overview of this customer's money.
  useEffect(() => {
    // If the server is not up yet (or restarting), try again for a while.
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) =>
      getSummary(personaId, bankIds, controller.signal)
        .then(setSummary)
        .catch(() => {
          if (controller.signal.aborted) return;
          setSummary(null);
          if (attempt < 30) retry = setTimeout(() => void load(attempt + 1), 2000);
        });
    void load(0);
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
    // bankKey stands for bankIds, which is a new array on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, bankKey]);

  useEffect(() => {
    void loadConnected().then((saved) => {
      banksLoaded.current = true;
      setBanks((prev) => ({ ...saved, ...prev }));
    });
  }, []);
  useEffect(() => {
    if (banksLoaded.current) void saveConnected(banks);
  }, [banks]);
  /** Connect a bank (add), disconnect one (remove), or all of them (clear). */
  const changeBanks = useCallback(
    (change: { add?: string; remove?: string; clear?: boolean }) =>
      setBanks((prev) => {
        let list = change.clear ? [] : (prev[personaId] ?? []);
        if (change.add && !list.includes(change.add)) list = [...list, change.add];
        if (change.remove) list = list.filter((id) => id !== change.remove);
        const next = { ...prev };
        if (list.length) next[personaId] = list;
        else delete next[personaId];
        return next;
      }),
    [personaId],
  );

  // Surprise-fund plans the customer switched on, per customer, on the device only.
  useEffect(() => {
    void loadPlans().then((saved) => {
      plansLoaded.current = true;
      setPlans((prev) => ({ ...saved, ...prev }));
    });
  }, []);
  useEffect(() => {
    if (plansLoaded.current) void savePlans(plans);
  }, [plans]);
  const plan = plans[personaId];
  const setPlan = useCallback(
    (monthly: number | null) =>
      setPlans((prev) => {
        const next = { ...prev };
        if (monthly === null) delete next[personaId];
        else next[personaId] = { monthly, startedAt: Date.now() };
        return next;
      }),
    [personaId],
  );

  // What the coach is doing while an answer is on its way.
  useEffect(() => {
    if (phase !== 'thinking') return;
    const reset = setTimeout(() => setThinkingStep(0), 0);
    const a = setTimeout(() => setThinkingStep(1), 2200);
    const b = setTimeout(() => setThinkingStep(2), 4800);
    return () => {
      clearTimeout(reset);
      clearTimeout(a);
      clearTimeout(b);
      setThinkingStep(0);
    };
  }, [phase]);

  // Past conversations live on the device only.
  useEffect(() => {
    void loadConversations().then((saved) => {
      historyLoaded.current = true;
      setConversations((prev) => [...prev, ...saved.filter((c) => !prev.some((p) => p.id === c.id))]);
    });
  }, []);
  useEffect(() => {
    if (!historyLoaded.current) return;
    const timer = setTimeout(() => void saveConversations(conversations), 300);
    return () => clearTimeout(timer);
  }, [conversations]);

  /** Shows a message and adds it to its saved conversation. */
  const pushMessage = useCallback((conversationId: string, message: Message) => {
    setMessages((prev) => [...prev, message]);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() } : c)),
    );
  }, []);

  // A short message above the input that clears itself.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.retry ? 5000 : 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * Asks the coach. Callers make sure nothing else is in progress. `silent`
   * asks again without a new question bubble (after connecting a bank), with
   * no history so the answer stands on its own.
   */
  const submit = useCallback(
    (question: string, options: { banks?: string[]; silent?: boolean } = {}) => {
      Keyboard.dismiss();
      setDraft('');
      // Earlier answers carry the calculation behind their chart, so "another chart" can redraw it.
      const history = options.silent
        ? []
        : messages
            .filter((m) => !(m.role === 'assistant' && m.event))
            .slice(-6)
            .map((m) => ({ role: m.role, text: m.text, call: m.role === 'assistant' ? m.call : undefined }));
      let conversationId = currentId;
      if (!conversationId) {
        conversationId = `c${Date.now().toString(36)}`;
        const created: Conversation = { id: conversationId, personaId, title: titleFrom(question), updatedAt: Date.now(), messages: [] };
        setConversations((prev) => [created, ...prev]);
        setCurrentId(conversationId);
      }
      const target = conversationId;
      if (!options.silent) pushMessage(target, { id: newId(), role: 'user', text: question });
      setPhase('thinking');

      cancelRequest();
      const seq = requestSeq.current;
      const controller = new AbortController();
      inFlight.current = controller;
      const timeout = setTimeout(() => controller.abort(), 90_000);

      ask({ personaId, question, history, banks: options.banks ?? bankIds }, controller.signal)
        .then((answer) => {
          if (seq !== requestSeq.current) return;
          const id = newId();
          pushMessage(target, { id, role: 'assistant', text: answer.text, viz: answer.viz, call: answer.call, sources: answer.sources });
          if (speaker.voiceOn) speaker.speak(id, answer.text);
        })
        .catch((error: unknown) => {
          if (seq !== requestSeq.current) return;
          if (__DEV__) console.warn('ask failed', error);
          const status = error instanceof AskError ? error.status : undefined;
          const text = status === 429 ? strings.errorBusy : status === 502 ? strings.errorModel : strings.errorNetwork;
          pushMessage(target, { id: newId(), role: 'assistant', text });
        })
        .finally(() => {
          clearTimeout(timeout);
          if (seq !== requestSeq.current) return;
          inFlight.current = null;
          setPhase('idle');
        });
    },
    [messages, personaId, currentId, cancelRequest, pushMessage, bankIds, speaker],
  );

  /**
   * A bank is connected. If the conversation just showed the accounts card,
   * the coach carries on by itself and answers the same question again with
   * every account, this bank included.
   */
  const onBankConnected = useCallback(
    (bankId: string) => {
    const bank = bankById(bankId);
    if (!bank) return;
    setConnectOpen(false);
    changeBanks({ add: bank.id });
    const nextIds = [...new Set([...bankIds, bank.id])].sort();
    const at = messages.findLastIndex((m) => m.role === 'assistant' && m.viz?.kind === 'accounts');
    const asked = at > 0 ? messages.slice(0, at).findLast((m) => m.role === 'user') : undefined;
    if (currentId && asked && phase === 'idle') {
      pushMessage(currentId, { id: newId(), role: 'assistant', text: strings.connectedEvent.replace('{bank}', bank.name), event: true });
      submit(asked.text, { banks: nextIds, silent: true });
    }
    },
    [messages, currentId, phase, pushMessage, submit, changeBanks, bankIds],
  );

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (question && phase === 'idle') submit(question);
    },
    [phase, submit],
  );

  /** End of a spoken question: local Whisper (or the phone itself) turns it into text, then it is asked. */
  const finishListening = useCallback(async () => {
    const recording = await mic.stop();
    if (!recording || !recording.heardSpeech) {
      setPhase('idle');
      if (!micNote) setNotice({ text: strings.noSpeech, retry: true });
      return;
    }
    // Recognised on the phone already.
    if (recording.text !== undefined) {
      submit(recording.text);
      return;
    }
    setPhase('transcribing');
    cancelRequest();
    const seq = requestSeq.current;
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const text = await transcribe(recording.audio, recording.sampleRate, controller.signal);
      if (seq !== requestSeq.current) return;
      if (!text) {
        setPhase('idle');
        setNotice({ text: strings.notUnderstood, retry: true });
        return;
      }
      submit(text);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      if (__DEV__) console.warn('transcribe failed', error);
      setPhase('idle');
      setNotice(
        error instanceof AskError && error.status === 503
          ? { text: strings.speechUnavailable }
          : { text: strings.notUnderstood, retry: true },
      );
    }
  }, [mic, micNote, cancelRequest, submit]);

  useEffect(() => {
    finishRef.current = () => void finishListening();
  }, [finishListening]);

  const onOrbPress = useCallback(async () => {
    if (phase === 'thinking' || phase === 'transcribing') return;
    if (phase === 'listening') {
      void finishListening();
      return;
    }
    Keyboard.dismiss();
    speaker.stop();
    setMicNote(null);
    setNotice(null);
    setPhase('listening');
    const result = await mic.start();
    const problem = result === 'denied' ? strings.micDenied : result === 'error' ? strings.micError : null;
    if (problem) {
      setMicNote(problem);
      if (!empty) {
        setNotice({ text: problem });
        setPhase('idle');
      }
    }
  }, [phase, mic, finishListening, empty, speaker]);

  const settleDrawer = useCallback(
    (open: boolean) => {
      if (open) Keyboard.dismiss();
      setDrawerOpen(open);
      drawer.set(withTiming(open ? 1 : 0, DRAWER_TIMING));
    },
    [drawer],
  );

  const newChat = useCallback(() => {
    cancelRequest();
    speaker.stop();
    void mic.stop();
    setDraft('');
    setMessages([]);
    setCurrentId(null);
    setPhase('idle');
    settleDrawer(false);
  }, [mic, settleDrawer, cancelRequest, speaker]);

  const openConversation = useCallback(
    (id: string) => {
      const conversation = conversations.find((c) => c.id === id);
      if (!conversation) return;
      cancelRequest();
      speaker.stop();
      void mic.stop();
      setDraft('');
      setMessages(conversation.messages);
      setCurrentId(id);
      setPhase('idle');
      settleDrawer(false);
    },
    [conversations, cancelRequest, mic, settleDrawer, speaker],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id !== currentId) return;
      cancelRequest();
      setMessages([]);
      setCurrentId(null);
      setPhase('idle');
    },
    [currentId, cancelRequest],
  );

  // Development only (?persona=<id>): a different customer means different money.
  const selectPersona = useCallback(
    (id: string) => {
      setPersonaId(id);
      newChat();
    },
    [newChat],
  );

  // The preview links below call the same handlers a tap would.
  const openLatest = useCallback(() => {
    const latest = [...visibleConversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) openConversation(latest.id);
  }, [visibleConversations, openConversation]);

  const planMonthly = summary?.plan?.monthly;
  const actions = useRef({ send, onOrbPress, settleDrawer, cancelRequest, selectPersona, openLatest, setPlan, planMonthly, changeBanks, onBankConnected });
  useEffect(() => {
    actions.current = { send, onOrbPress, settleDrawer, cancelRequest, selectPersona, openLatest, setPlan, planMonthly, changeBanks, onBankConnected };
  }, [send, onOrbPress, settleDrawer, cancelRequest, selectPersona, openLatest, setPlan, planMonthly, changeBanks, onBankConnected]);

  // Development only: jump straight to a state, e.g. exp://127.0.0.1:8081/--/?preview=chat
  useEffect(() => {
    if (!__DEV__) return;
    const apply = (url: string | null | undefined) => {
      const personaParam = url?.match(/[?&]persona=(\w+)/)?.[1];
      if (personaParam && personas.some((p) => p.id === personaParam)) actions.current.selectPersona(personaParam);
      const name = url?.match(/[?&]preview=(\w+)/)?.[1];
      if (!name) return;
      // Preview answers are not saved as conversations.
      if (['hero', 'chat', 'chat2', 'chat3', 'chat4', 'chat5', 'thinking'].includes(name)) setCurrentId(null);
      if (name !== 'send' && name !== 'mic' && !name.startsWith('drawer') && name !== 'keyboard') {
        actions.current.cancelRequest();
      }
      const ask = (i: number): Message => ({ id: newId(), role: 'user', text: suggestions[i] });
      if (name === 'hero') {
        setMessages([]);
        setPhase('idle');
      } else if (name === 'chat' || name === 'chat2' || name === 'chat3') {
        const i = name === 'chat' ? 0 : name === 'chat2' ? 1 : 2;
        setMessages([ask(i), placeholderAnswer(suggestions[i])]);
        setPhase('idle');
      } else if (name === 'chat4' || name === 'chat5') {
        const key = name === 'chat4' ? 'whatif' : 'ranking';
        setMessages([{ id: newId(), role: 'user', text: key }, placeholderAnswer(key)]);
        setPhase('idle');
      } else if (name === 'thinking') {
        setMessages([ask(0)]);
        setPhase('thinking');
      } else if (name === 'listening' || name === 'listening2') {
        // No microphone here: a canned level and waveform so the listening layout can be inspected.
        if (name === 'listening2') setMessages([ask(0), placeholderAnswer(suggestions[0])]);
        let t = 0;
        const feed = setInterval(() => {
          t += 1;
          const v = t % 30 < 22 ? 0.25 + 0.55 * Math.abs(Math.sin(t * 0.7)) * Math.random() : 0.02;
          waveHistory.set([...waveHistory.get().slice(-47), v]);
          if (t > 80) clearInterval(feed);
        }, 100);
        level.set(withRepeat(
          withSequence(
            withTiming(0.75, { duration: 240 }),
            withTiming(0.25, { duration: 300 }),
            withTiming(0.9, { duration: 200 }),
            withTiming(0.15, { duration: 380 }),
          ),
          -1,
        ));
        setPhase('listening');
      } else if (name === 'send') {
        // ?preview=send&q=<question> sends that question, otherwise a suggestion.
        const q = url?.match(/[?&]q=([^&]+)/)?.[1]?.replace(/\+/g, ' ');
        let question = q ?? suggestions[1];
        try {
          question = decodeURIComponent(question);
        } catch {
          // Already decoded on the way in.
        }
        actions.current.send(question);
      } else if (name === 'mic') {
        actions.current.onOrbPress();
      } else if (name === 'keyboard') {
        // ?preview=keyboard&q=... also puts text in the field (to check long questions wrap).
        const q = url?.match(/[?&]q=([^&]+)/)?.[1]?.replace(/\+/g, ' ');
        if (q) {
          try {
            setDraft(decodeURIComponent(q));
          } catch {
            setDraft(q);
          }
        }
        inputRef.current?.focus();
      } else if (name === 'connect') {
        setConnectOpen(true);
      } else if (name === 'connected' || name === 'bankson') {
        // ?preview=connected&bank=op: as if the consent and the sign-in had just finished
        // (the coach carries on); bankson only switches the bank on.
        const bank = url?.match(/[?&]bank=(\w+)/)?.[1] ?? 'op';
        if (name === 'connected') actions.current.onBankConnected(bank);
        else actions.current.changeBanks({ add: bank });
      } else if (name === 'banksoff') {
        actions.current.changeBanks({ clear: true });
      } else if (name === 'reset') {
        // A clean start for a demo: no saved conversations, no plan, only S-Pankki.
        setConversations([]);
        actions.current.setPlan(null);
        actions.current.changeBanks({ clear: true });
        actions.current.cancelRequest();
        setMessages([]);
        setCurrentId(null);
        setPhase('idle');
      } else if (name === 'planon' || name === 'planoff') {
        actions.current.setPlan(name === 'planon' ? (actions.current.planMonthly ?? 0) : null);
      } else if (name === 'notice') {
        setNotice({ text: strings.noSpeech, retry: true });
      } else if (name === 'open') {
        actions.current.openLatest();
      } else if (name === 'drawer') {
        actions.current.settleDrawer(true);
      } else if (name === 'drawerclose') {
        actions.current.settleDrawer(false);
      }
    };
    Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', (event) => apply(event.url));
    return () => subscription.remove();
  }, [level, waveHistory]);

  const sheetStyle = useAnimatedStyle(() => ({
    height: interpolate(expand.value, [0, 1], [DOCK_SHEET + inputExtraSV.value, Math.max(areaHeight.value, DOCK_SHEET + inputExtraSV.value)]),
  }));
  const orbStyle = useAnimatedStyle(() => ({
    margin: -(ORB_CANVAS * (1 - FOOTPRINT * scale.value)) / 2,
    transform: [{ translateX: orbX.value }, { translateY: orbY.value }, { scale: scale.value }],
  }));
  // The floor shadow belongs to the floating orb, not to the one in the field.
  const orbShadow = useDerivedValue(() => expand.value);
  // Docked in the field, the halo stays small so it does not spill over the edges.
  const orbHalo = useDerivedValue(() => 0.3 + 0.7 * expand.value);
  const captionStyle = useAnimatedStyle(() => ({ marginTop: 12 + 55 * scale.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: 1 - expand.value }));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: keyboardOpen ? 0 : insets.bottom }]}>
          <View style={styles.headerSpace} />
          <View
            style={styles.flex}
            onLayout={(event) => {
              areaHeight.set(event.nativeEvent.layout.height);
            }}>
            <ScrollView
              ref={listRef}
              style={[StyleSheet.absoluteFill, { top: -(insets.top + HEADER) }]}
              contentContainerStyle={[styles.list, { paddingTop: insets.top + HEADER + 8, paddingBottom: DOCK_SHEET + 32 + inputExtra }]}
              scrollIndicatorInsets={{ top: insets.top + HEADER }}
              // It reaches under the status bar on purpose; iOS must not add its own inset on top.
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustContentInsets={false}
              onContentSizeChange={() => followEnd.current && listRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {messages.map((message) =>
                message.role === 'user' ? (
                  <Animated.View key={message.id} entering={FadeInDown.duration(260)} style={styles.userBubble}>
                    <Text style={styles.userText}>{message.text}</Text>
                  </Animated.View>
                ) : message.event ? (
                  <Animated.View key={message.id} entering={FadeIn.duration(300)} style={styles.event}>
                    <Text style={styles.eventText}>✓ {message.text}</Text>
                  </Animated.View>
                ) : (
                  <Animated.View key={message.id} entering={FadeInDown.duration(320)} style={styles.answer}>
                    {message.viz ? <Viz viz={message.viz} onConnect={canConnectMore ? () => setConnectOpen(true) : undefined} /> : null}
                    <Text style={[styles.answerText, !message.viz && styles.answerTextAlone]}>{message.text}</Text>
                    {/* Listen to this answer (also when the voice is muted). */}
                    <Pressable
                      onPress={() => (speaker.speakingId === message.id ? speaker.stop() : speaker.speak(message.id, message.text))}
                      accessibilityRole="button"
                      hitSlop={8}
                      style={({ pressed }) => [styles.listen, pressed && styles.headerPressed]}>
                      <SpeakerIcon size={16} color={colors.green700} />
                      <Text style={styles.listenText}>{speaker.speakingId === message.id ? strings.listenStop : strings.listen}</Text>
                    </Pressable>
                    {message.sources?.length ? (
                      <Text style={styles.answerSource}>
                        {strings.source} {message.sources.map((s) => s.replace(/^(Tilastokeskus|Statistics Finland), /, '')).join(' · ')}
                      </Text>
                    ) : null}
                    {message.viz?.kind === 'replay' ? (
                      <PlanButton
                        monthly={plan?.monthly ?? message.viz.value}
                        date={message.viz.paydayLabel}
                        active={!!plan}
                        onStart={() => setPlan(message.viz?.value ?? 0)}
                        onStop={() => setPlan(null)}
                      />
                    ) : null}
                  </Animated.View>
                ),
              )}
              {phase === 'thinking' ? (
                <Animated.Text entering={FadeIn.duration(200)} style={styles.thinking}>
                  {strings.thinkingSteps[thinkingStep] ?? strings.thinking}
                </Animated.Text>
              ) : null}
            </ScrollView>

            <Animated.View style={[styles.sheet, sheetStyle]}>
              <Animated.View style={[styles.fade, fadeStyle]} pointerEvents="none">
                <Canvas style={styles.flex}>
                  <Rect x={0} y={0} width={width} height={FADE}>
                    <LinearGradient start={vec(0, 0)} end={vec(0, FADE)} colors={['rgba(255,255,255,0)', '#FFFFFF']} />
                  </Rect>
                </Canvas>
              </Animated.View>

              {voiceActive && !docked ? null : (
                <Animated.View entering={FadeIn.duration(250)} style={[styles.inputRow, styles.inputRowPinned]}>
                  <View
                    style={styles.field}
                    onLayout={(event) => {
                      const extra = Math.max(0, Math.round(event.nativeEvent.layout.height - FIELD_HEIGHT));
                      setInputExtra(extra);
                      inputExtraSV.set(extra);
                    }}>
                    {listening ? (
                      <View style={styles.listeningRow} accessibilityLabel={strings.listeningTitle}>
                        <ListeningTime />
                        <Waveform history={mic.history} />
                      </View>
                    ) : phase === 'transcribing' ? (
                      <View style={styles.statusRow}>
                        <Text style={styles.statusText} numberOfLines={1}>
                          {strings.transcribingInline}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.inputWrap}>
                        {/* An invisible copy of the text measures how many lines it needs; the text view
                            itself only reports its size reliably while typing, not when the text is set. */}
                        <Text
                          style={[styles.input, styles.inputMeasure]}
                          onLayout={(e) => setInputHeight(Math.min(INPUT_MAX, Math.max(SLOT, Math.round(e.nativeEvent.layout.height))))}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants">
                          {draft || ' '}
                        </Text>
                        <TextInput
                          ref={inputRef}
                          style={[styles.input, { height: inputHeight }]}
                          value={draft}
                          onChangeText={setDraft}
                          placeholder={strings.inputPlaceholder}
                          placeholderTextColor={colors.textTertiary}
                          multiline
                          submitBehavior="blurAndSubmit"
                          returnKeyType="send"
                          onSubmitEditing={() => send(draft)}
                          selectionColor={colors.green700}
                        />
                      </View>
                    )}
                    {/* On the start screen the send button is always there; in a conversation the orb holds its place until you type. */}
                    {(draft.trim() || !docked) && !voiceActive ? (
                      <Pressable
                        onPress={() => (draft.trim() ? send(draft) : inputRef.current?.focus())}
                        style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={strings.send}
                        hitSlop={8}>
                        <Text style={styles.sendGlyph}>↑</Text>
                      </Pressable>
                    ) : docked ? (
                      <View style={styles.orbSlot} />
                    ) : null}
                  </View>
                </Animated.View>
              )}

              <View style={styles.stage}>
                <Animated.View style={[styles.orbWrap, orbStyle]} pointerEvents={mode === 'dockHidden' ? 'none' : 'box-none'}>
                  <Mascot level={level} energy={energy} shadow={orbShadow} halo={orbHalo} />
                  <Pressable
                    style={styles.orbHit}
                    onPress={onOrbPress}
                    accessibilityRole="button"
                    accessibilityLabel={listening ? strings.orbStop : strings.orbStart}
                  />
                </Animated.View>
                {expanded && mode !== 'heroCompact' ? (
                  <Animated.View
                    key={phase === 'transcribing' ? 'transcribing' : listening ? 'listening' : 'hero'}
                    entering={FadeIn.duration(300).delay(140)}
                    exiting={FadeOut.duration(120)}
                    style={[styles.caption, captionStyle]}>
                    <Text style={styles.title}>
                      {phase === 'transcribing' ? strings.transcribingTitle : listening ? strings.listeningTitle : `${strings.greeting}, ${persona.name}`}
                    </Text>
                    {phase === 'transcribing' || listening ? (
                      <Text style={styles.hint}>{phase === 'transcribing' ? strings.transcribingHint : (micNote ?? strings.listeningHint)}</Text>
                    ) : plan && summary?.plan ? (
                      <View style={styles.planPill}>
                        <Text style={styles.planPillText}>
                          {fill(strings.planHome, { amount: plan.monthly, date: summary.plan.nextPayday })}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.hint}>{strings.heroHint}</Text>
                    )}
                  </Animated.View>
                ) : null}
              </View>

              {mode === 'hero' ? (
                <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(150)} style={styles.overview}>
                  <HomeOverview summary={summary} fallback={suggestions} onAsk={send} />
                </Animated.View>
              ) : null}


              {/* A toast: a dark bar right above the input, as wide as the field. */}
              {notice ? (
                <Animated.View
                  entering={FadeInDown.duration(220)}
                  exiting={FadeOutDown.duration(180)}
                  style={[styles.toast, { bottom: INPUT_ROW + inputExtra }]}
                  accessibilityLiveRegion="polite">
                  <Text style={styles.toastText} numberOfLines={2}>
                    {notice.text}
                  </Text>
                  {notice.retry ? (
                    <Pressable
                      onPress={() => {
                        setNotice(null);
                        void onOrbPress();
                      }}
                      accessibilityRole="button"
                      hitSlop={12}>
                      <Text style={styles.toastAction}>{strings.retry}</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : null}

              {/* The input row itself is drawn earlier (pinned to the bottom) so the orb can sit on top of it. */}
              <View style={{ height: INPUT_ROW + inputExtra }} />
            </Animated.View>
          </View>
          {/* Drawn after the conversation so it sits above it; the conversation scrolls up underneath and fades out. */}
          <View style={[styles.header, { top: insets.top }]} pointerEvents="box-none">
            <View style={[styles.topFade, { top: -insets.top, height: insets.top + HEADER + TOP_FADE }]} pointerEvents="none">
              <Canvas style={styles.flex}>
                <Rect x={0} y={0} width={width} height={insets.top + HEADER + TOP_FADE}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(0, insets.top + HEADER + TOP_FADE)}
                    colors={['#FFFFFF', '#FFFFFF', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
                    positions={[0, (insets.top + 6) / (insets.top + HEADER + TOP_FADE), (insets.top + HEADER * 0.7) / (insets.top + HEADER + TOP_FADE), 1]}
                  />
                </Rect>
              </Canvas>
            </View>
            <Pressable
              onPress={() => settleDrawer(true)}
              accessibilityRole="button"
              accessibilityLabel={strings.menuOpen}
              hitSlop={10}
              style={({ pressed }) => [styles.profileButton, pressed && styles.headerPressed]}>
              <PersonIcon size={22} color={colors.green700} />
            </Pressable>
            <View style={styles.flex} pointerEvents="none" />
            {/* Read answers aloud, or mute; the text always shows. */}
            <Pressable
              onPress={speaker.toggleVoice}
              accessibilityRole="switch"
              accessibilityState={{ checked: speaker.voiceOn }}
              accessibilityLabel={strings.voiceLabel}
              hitSlop={10}
              style={({ pressed }) => [styles.profileButton, !empty && styles.headerGap, pressed && styles.headerPressed]}>
              <SpeakerIcon size={22} color={colors.green700} muted={!speaker.voiceOn} />
            </Pressable>
            {/* A new conversation; on the start screen one is already open. */}
            {empty ? null : (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                <Pressable
                  onPress={newChat}
                  accessibilityRole="button"
                  accessibilityLabel={strings.newChat}
                  hitSlop={10}
                  style={({ pressed }) => [styles.profileButton, pressed && styles.headerPressed]}>
                  <NewChatIcon size={23} color={colors.green700} />
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Drawer
        open={drawerOpen}
        progress={drawer}
        width={drawerWidth}
        persona={persona}
        conversations={visibleConversations}
        currentId={currentId}
        onOpen={openConversation}
        onDelete={deleteConversation}
        onNewChat={newChat}
        onSettle={settleDrawer}
        banks={connectedBanks}
        canConnectMore={canConnectMore}
        onConnectBank={() => {
          settleDrawer(false);
          setConnectOpen(true);
        }}
        onDisconnectBank={(id) => changeBanks({ remove: id })}
      />
      {/* The on-device Kokoro voice (installed app only). */}
      {KokoroEngine ? <KokoroEngine onApi={speaker.onKokoro} /> : null}
      <ConnectSheet visible={connectOpen} connectedIds={bankIds} onClose={() => setConnectOpen(false)} onConnected={onBankConnected} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.bg },

  headerSpace: { height: HEADER },
  header: { position: 'absolute', left: 0, right: 0, height: HEADER, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  topFade: { position: 'absolute', left: 0, right: 0 },
  profileButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPressed: { opacity: 0.6 },
  headerGap: { marginRight: 10 },
  listen: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 10, paddingVertical: 4, paddingHorizontal: 2 },
  listenText: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.green700 },

  list: { paddingHorizontal: 20, paddingBottom: DOCK_SHEET + 32 },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.greenTint,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  userText: { ...type.body, color: colors.text },
  answer: { marginBottom: 28 },
  answerText: { ...type.body, color: colors.text, marginTop: 14, paddingHorizontal: 2 },
  answerTextAlone: { marginTop: 0 },
  event: { alignSelf: 'center', backgroundColor: colors.greenTint, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 18 },
  eventText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.green700 },
  answerSource: { ...type.caption, color: colors.textTertiary, marginTop: 8, paddingHorizontal: 2 },
  planButton: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: colors.green700, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  planButtonPressed: { backgroundColor: colors.green900 },
  planButtonText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#FFFFFF' },
  planRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 14 },
  planOn: { flexShrink: 1, backgroundColor: colors.greenTint, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10 },
  planOnText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.green700 },
  planStop: { fontSize: 14, color: colors.textSecondary },
  planPill: { marginTop: 8, backgroundColor: colors.greenTint, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  planPillText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.green700, textAlign: 'center' },
  thinking: { ...type.label, color: colors.textTertiary, paddingHorizontal: 2 },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE, height: FADE },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbWrap: { width: ORB_CANVAS, height: ORB_CANVAS },
  orbHit: {
    position: 'absolute',
    width: ORB_DIAMETER,
    height: ORB_DIAMETER,
    borderRadius: ORB_DIAMETER / 2,
    left: (ORB_CANVAS - ORB_DIAMETER) / 2,
    // The shader draws the body slightly above the canvas centre.
    top: (ORB_CANVAS - ORB_DIAMETER) / 2 - ORB_CANVAS * 0.02,
  },
  caption: { alignItems: 'center', paddingHorizontal: 32 },
  title: { ...type.title, color: colors.text, textAlign: 'center' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#1F1F1F',
  },
  toastText: { flex: 1, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  toastAction: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.green200, marginLeft: 16 },
  hint: { ...type.label, fontWeight: '400', color: colors.textSecondary, textAlign: 'center', marginTop: 6 },

  overview: { paddingBottom: 16 },

  inputRowPinned: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // Pinned to the bottom, so a taller field grows upwards; the button and the orb stay on the last line.
  inputRow: { minHeight: INPUT_ROW, paddingHorizontal: 16, paddingVertical: (INPUT_ROW - FIELD_HEIGHT) / 2, justifyContent: 'flex-end' },
  field: {
    minHeight: FIELD_HEIGHT,
    borderRadius: 24,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: (FIELD_HEIGHT - SLOT) / 2,
    paddingLeft: 18,
    paddingRight: FIELD_PAD_RIGHT,
  },
  inputWrap: { flex: 1 },
  inputMeasure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  // Natural line height: a fixed lineHeight makes iOS put the extra space above the text, so it sits low.
  // The padding makes one line as tall as the orb slot, so it is centred like the orb beside it.
  input: { fontSize: 17, color: colors.text, paddingTop: 10, paddingBottom: 10 },
  sendButton: {
    width: 36,
    height: 36,
    marginBottom: (SLOT - 36) / 2,
    borderRadius: 18,
    backgroundColor: colors.green200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: { backgroundColor: colors.green400 },
  orbSlot: { width: SLOT, height: SLOT },
  listeningRow: { flex: 1, height: SLOT, flexDirection: 'row', alignItems: 'center' },
  statusRow: { flex: 1, height: SLOT, justifyContent: 'center' },
  statusText: { fontSize: 17, color: colors.textSecondary },
  sendGlyph: { fontSize: 20, lineHeight: 24, fontWeight: '600', color: colors.green900 },
});
