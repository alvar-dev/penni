import { useMemo } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { strings, type Persona } from '../content';
import type { OtherBankInfo } from '../shared/banks';
import { BankLogo } from './BankLogo';
import { groupByDay, shortTime, type Conversation } from '../conversations';
import { colors, formatEur, type } from '../theme';

export const DRAWER_TIMING = { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };

/** Width of the strip along the left edge that starts the open gesture. */
const EDGE = 18;
/** Rows are inset by this much inside their highlight. */
const ROW_INSET = 12;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type Props = {
  open: boolean;
  /** 0 = closed, 1 = open. Dragging writes to it directly; `onSettle` animates the rest. */
  progress: SharedValue<number>;
  width: number;
  persona: Persona;
  conversations: Conversation[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
  onSettle: (open: boolean) => void;
  /** The other bank connected under PSD2, if any. */
  bank?: OtherBankInfo;
  onConnectBank: () => void;
  onDisconnectBank: () => void;
};

/** What a saved conversation's row shows under its title: the latest answer's key figure. */
function describe(c: Conversation): string {
  const answers = c.messages.filter((m) => m.role === 'assistant');
  const withChart = [...answers].reverse().find((m) => m.role === 'assistant' && m.viz);
  if (withChart && withChart.role === 'assistant' && withChart.viz) {
    const v = withChart.viz;
    const amount = v.kind === 'trend' && Math.abs(v.value) < 10 ? formatEur(v.value, 2) : formatEur(v.value, 0);
    return `${amount} · ${v.label}`;
  }
  const last = answers[answers.length - 1];
  return last ? last.text : strings.noAnswer;
}

/** The round initial used for a person, as on S-mobiili's own profile page. */
export function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.slice(0, 1)}</Text>
    </View>
  );
}

export function Drawer({ open, progress, width, persona, conversations, currentId, onOpen, onDelete, onNewChat, onSettle, bank, onConnectBank, onDisconnectBank }: Props) {
  const insets = useSafeAreaInsets();
  const groups = useMemo(() => groupByDay(conversations), [conversations]);

  // Drag the panel left to close it; swipe in from the screen edge to open it.
  const dragClose = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => progress.set(clamp01(1 + g.dx / width)),
        onPanResponderRelease: (_, g) => onSettle(!(g.dx < -width * 0.3 || g.vx < -0.5)),
        onPanResponderTerminate: () => onSettle(true),
      }),
    [progress, width, onSettle],
  );
  const dragOpen = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => progress.set(clamp01(g.dx / width)),
        onPanResponderRelease: (_, g) => onSettle(g.dx > width * 0.3 || g.vx > 0.5),
        onPanResponderTerminate: () => onSettle(false),
      }),
    [progress, width, onSettle],
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    // Parked a little further out than its width so its shadow is off screen too.
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-(width + 40), 0]) }],
  }));

  const confirmDelete = (c: Conversation) =>
    Alert.alert(strings.deleteTitle, c.title, [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.delete, style: 'destructive', onPress: () => onDelete(c.id) },
    ]);

  return (
    <>
      {open ? null : <View style={styles.edge} {...dragOpen.panHandlers} />}

      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onSettle(false)}
          accessibilityRole="button"
          accessibilityLabel={strings.menuClose}
        />
      </Animated.View>

      <Animated.View
        style={[styles.panel, { width, paddingTop: insets.top + 24 }, panelStyle]}
        accessibilityViewIsModal={open}
        importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        {...dragClose.panHandlers}>
        <Text style={styles.heading}>{strings.historyTitle}</Text>

        <Pressable
          onPress={onNewChat}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newChat, pressed && styles.newChatPressed]}>
          <Text style={styles.newChatGlyph}>+</Text>
          <Text style={styles.newChatText}>{strings.newChat}</Text>
        </Pressable>

        {/* The list reaches the panel's sides so row highlights are never clipped. */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: ROW_INSET, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}>
          {groups.length === 0 ? <Text style={styles.empty}>{strings.historyEmpty}</Text> : null}
          {groups.map((group) => (
            <View key={group.title}>
              <Text style={styles.section}>{group.title}</Text>
              {group.items.map((c) => {
                const selected = c.id === currentId;
                const detail = describe(c);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onOpen(c.id)}
                    onLongPress={() => confirmDelete(c)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityHint={strings.deleteHint}
                    style={({ pressed }) => [styles.row, styles.conversation, selected && styles.rowSelected, pressed && !selected && styles.pressed]}>
                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {c.title}
                        </Text>
                        <Text style={styles.rowTime}>{shortTime(c.updatedAt)}</Text>
                      </View>
                      <Text style={styles.rowDetail} numberOfLines={1}>
                        {detail}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* The banks the coach can see, then the signed-in customer, out of the way at the bottom. */}
        <View style={styles.banks}>
          <Text style={styles.banksTitle}>{strings.banksTitle}</Text>
          <View style={styles.bankRow}>
            <BankLogo id="spankki" size={22} />
            <Text style={styles.bankName}>S-Pankki</Text>
          </View>
          {bank ? (
            <View style={styles.bankRow}>
              <BankLogo id={bank.id} size={22} />
              <Text style={styles.bankName}>{bank.name}</Text>
              <Pressable onPress={onDisconnectBank} hitSlop={8} accessibilityRole="button">
                <Text style={styles.bankAction}>{strings.banksDisconnect}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={onConnectBank} hitSlop={6} accessibilityRole="button" style={styles.bankRow}>
              <Text style={styles.bankConnect}>+ {strings.accountsConnect}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.profile, { paddingBottom: insets.bottom + 10 }]}>
          <Avatar name={persona.name} size={32} />
          <Text style={styles.name}>{persona.name}</Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // The drawer is above everything on the screen, whatever stacking order lies beneath it.
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE, zIndex: 10 },
  scrim: { backgroundColor: 'rgba(0, 0, 0, 0.28)', zIndex: 10 },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    zIndex: 11,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 6, height: 0 },
    elevation: 16,
  },

  avatar: { backgroundColor: colors.green100, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '600', color: colors.green700 },

  heading: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.3, color: colors.text },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.greenTint,
    paddingHorizontal: 14,
    marginTop: 16,
    marginBottom: 4,
  },
  newChatPressed: { backgroundColor: colors.green100 },
  newChatGlyph: { fontSize: 22, lineHeight: 24, fontWeight: '400', color: colors.green700, marginRight: 8 },
  newChatText: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.green700 },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  name: { fontSize: 16, lineHeight: 21, fontWeight: '500', color: colors.text, marginLeft: 10 },
  banks: { paddingTop: 12, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  banksTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 },
  bankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  bankName: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.text, marginLeft: 10 },
  bankAction: { fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  bankConnect: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.green700 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -ROW_INSET,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 11,
    borderRadius: 12,
  },
  pressed: { backgroundColor: colors.surface },

  list: { flex: 1, marginHorizontal: -ROW_INSET },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textSecondary, marginTop: 20, marginBottom: 6 },
  rowSelected: { backgroundColor: colors.greenTint },
  conversation: { paddingVertical: 10 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline' },
  rowTitle: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500', color: colors.text },
  rowTime: { fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginLeft: 10, fontVariant: ['tabular-nums'] },
  rowDetail: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 1 },
  empty: { ...type.label, fontWeight: '400', color: colors.textSecondary, marginTop: 18 },
});
