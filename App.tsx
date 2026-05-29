import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STORAGE_KEY = 'splitcheck:recent:v1';
const TIP_PRESETS = [10, 15, 18, 20, 25];

type Snapshot = {
  id: string;
  bill: number;
  tipPct: number;
  people: number;
  total: number;
  perPerson: number;
  at: number;
};

export default function App() {
  const [billText, setBillText] = useState('');
  const [tipPct, setTipPct] = useState(18);
  const [customTip, setCustomTip] = useState('');
  const [peopleText, setPeopleText] = useState('2');
  const [recent, setRecent] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setRecent(JSON.parse(raw));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recent)).catch(() => {});
  }, [recent, loaded]);

  // Accept comma OR dot as decimal separator (locale tolerance), clamp
  // negative inputs to 0, and cap the bill to keep arithmetic finite.
  const MAX_BILL = 1e9;
  const parseAmount = (s: string): number => {
    const cleaned = s.replace(',', '.');
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(MAX_BILL, n));
  };
  const parseTip = (s: string): number => {
    const cleaned = s.replace(',', '.');
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n)) return NaN;
    return Math.max(0, n);
  };
  const bill = parseAmount(billText);
  const customTipPct = customTip.trim() ? parseTip(customTip) : NaN;
  const effectiveTipPct = Number.isFinite(customTipPct) ? customTipPct : tipPct;
  const people = Math.max(1, parseInt(peopleText, 10) || 1);

  const tipAmount = bill * (effectiveTipPct / 100);
  const total = bill + tipAmount;
  const perPerson = total / people;
  const perPersonTip = tipAmount / people;
  const perPersonBill = bill / people;

  const setPreset = useCallback((pct: number) => {
    Haptics.selectionAsync().catch(() => {});
    setTipPct(pct);
    setCustomTip('');
  }, []);

  const adjustPeople = useCallback((delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPeopleText((prev) => {
      const next = Math.max(1, (parseInt(prev, 10) || 1) + delta);
      return String(next);
    });
  }, []);

  const saveSnapshot = useCallback(() => {
    if (bill <= 0) return;
    // Belt-and-suspenders: refuse to persist non-finite math.
    if (!Number.isFinite(total) || !Number.isFinite(perPerson)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const snap: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bill,
      tipPct: effectiveTipPct,
      people,
      total,
      perPerson,
      at: Date.now(),
    };
    setRecent((prev) => [snap, ...prev].slice(0, 10));
  }, [bill, effectiveTipPct, people, total, perPerson]);

  const copySummary = useCallback(async () => {
    if (bill <= 0) return;
    const text = `Bill ${money(bill)} · ${effectiveTipPct.toFixed(1)}% tip (${money(tipAmount)}) · ${people} people\nTotal: ${money(total)} · Each: ${money(perPerson)}`;
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Copied', 'Summary on your clipboard.');
  }, [bill, effectiveTipPct, tipAmount, people, total, perPerson]);

  const clearAll = useCallback(() => {
    setBillText('');
    setCustomTip('');
    setTipPct(18);
    setPeopleText('2');
  }, []);

  const restoreSnapshot = useCallback((s: Snapshot) => {
    Haptics.selectionAsync().catch(() => {});
    setBillText(s.bill.toFixed(2));
    setTipPct(TIP_PRESETS.includes(s.tipPct) ? s.tipPct : 18);
    setCustomTip(TIP_PRESETS.includes(s.tipPct) ? '' : String(s.tipPct));
    setPeopleText(String(s.people));
  }, []);

  const deleteSnapshot = useCallback((id: string) => {
    setRecent((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Split <Text style={styles.titleItalic}>Check</Text></Text>
            <Pressable
              onPress={clearAll}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Bill amount</Text>
            <View style={styles.billRow}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={billText}
                onChangeText={setBillText}
                placeholder="0.00"
                placeholderTextColor="#bbb"
                style={styles.billInput}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Tip</Text>
            <View style={styles.tipRow}>
              {TIP_PRESETS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPreset(p)}
                  style={({ pressed }) => [
                    styles.tipChip,
                    effectiveTipPct === p && !customTip && styles.tipChipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.tipChipText,
                      effectiveTipPct === p && !customTip && styles.tipChipTextActive,
                    ]}
                  >
                    {p}%
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.customRow}>
              <TextInput
                value={customTip}
                onChangeText={setCustomTip}
                placeholder="Custom %"
                placeholderTextColor="#bbb"
                style={styles.customInput}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Split between</Text>
            <View style={styles.peopleRow}>
              <Pressable
                onPress={() => adjustPeople(-1)}
                style={({ pressed }) => [styles.stepper, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <TextInput
                value={peopleText}
                onChangeText={setPeopleText}
                keyboardType="number-pad"
                style={styles.peopleInput}
                maxLength={3}
              />
              <Pressable
                onPress={() => adjustPeople(1)}
                style={({ pressed }) => [styles.stepper, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
              <Text style={styles.peopleLabel}>{people === 1 ? 'person' : 'people'}</Text>
            </View>
          </View>

          <View style={styles.summary}>
            <SummaryRow label="Tip" value={money(tipAmount)} />
            <SummaryRow label="Total" value={money(total)} />
            <View style={styles.divider} />
            <View style={styles.perPersonBlock}>
              <Text style={styles.perPersonLabel}>Each pays</Text>
              <Text style={styles.perPersonAmount}>{money(perPerson)}</Text>
              <Text style={styles.perPersonBreak}>
                {money(perPersonBill)} bill + {money(perPersonTip)} tip
              </Text>
            </View>
            <View style={styles.summaryActions}>
              <Pressable
                onPress={copySummary}
                disabled={bill <= 0}
                style={({ pressed }) => [
                  styles.actionBtn,
                  bill <= 0 && styles.actionBtnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.actionBtnText}>Copy summary</Text>
              </Pressable>
              <Pressable
                onPress={saveSnapshot}
                disabled={bill <= 0}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  bill <= 0 && styles.actionBtnDisabled,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Save</Text>
              </Pressable>
            </View>
          </View>

          {recent.length > 0 && (
            <View style={styles.recent}>
              <Text style={styles.recentTitle}>Recent</Text>
              {recent.map((s) => (
                <View key={s.id} style={styles.recentRow}>
                  <Pressable
                    onPress={() => restoreSnapshot(s)}
                    style={({ pressed }) => [styles.recentMain, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.recentBill}>
                      {money(s.bill)} · {s.tipPct.toFixed(1)}% · {s.people}p
                    </Text>
                    <Text style={styles.recentSub}>
                      Each {money(s.perPerson)} · {timeAgo(s.at)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => deleteSnapshot(s.id)}
                    style={({ pressed }) => [styles.recentDelete, pressed && { opacity: 0.5 }]}
                    hitSlop={8}
                  >
                    <Text style={styles.recentDeleteText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function money(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf6ed' },
  scroll: { padding: 22, paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '700', color: '#1a1815', letterSpacing: -0.3 },
  titleItalic: { fontStyle: 'italic', color: '#a87a1f', fontWeight: '600' },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { color: '#7a756c', fontSize: 13, fontWeight: '600' },

  section: { marginBottom: 24 },
  label: {
    fontSize: 11, color: '#a09c92', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 10,
  },

  billRow: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: '#fffefb', borderRadius: 14,
    padding: 18,
    borderWidth: 1, borderColor: '#e8e1cd',
  },
  dollar: { fontSize: 30, color: '#a09c92', marginRight: 6, fontVariant: ['tabular-nums'] },
  billInput: {
    flex: 1, fontSize: 40, color: '#1a1815', fontWeight: '300',
    fontVariant: ['tabular-nums'], padding: 0,
  },

  tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    backgroundColor: '#fffefb', borderWidth: 1, borderColor: '#e8e1cd',
  },
  tipChipActive: { backgroundColor: '#a87a1f', borderColor: '#a87a1f' },
  tipChipText: { color: '#5a554c', fontSize: 14, fontWeight: '600' },
  tipChipTextActive: { color: '#fff' },
  customRow: { marginTop: 8 },
  customInput: {
    backgroundColor: '#fffefb', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#1a1815',
    borderWidth: 1, borderColor: '#e8e1cd',
  },

  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fffefb', borderWidth: 1, borderColor: '#e8e1cd',
    alignItems: 'center', justifyContent: 'center',
  },
  stepperText: { fontSize: 22, color: '#5a554c', lineHeight: 24 },
  peopleInput: {
    minWidth: 64, textAlign: 'center',
    fontSize: 22, color: '#1a1815', fontWeight: '600',
    backgroundColor: '#fffefb', borderRadius: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: '#e8e1cd', fontVariant: ['tabular-nums'],
  },
  peopleLabel: { fontSize: 14, color: '#7a756c', marginLeft: 4 },

  summary: {
    backgroundColor: '#fffefb', borderRadius: 18,
    padding: 22, marginTop: 8,
    borderWidth: 1, borderColor: '#e8e1cd',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: '#7a756c' },
  summaryValue: { fontSize: 15, color: '#1a1815', fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: '#eee3c8', marginVertical: 14 },
  perPersonBlock: { alignItems: 'center', marginBottom: 16 },
  perPersonLabel: { fontSize: 11, color: '#a09c92', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  perPersonAmount: { fontSize: 44, color: '#a87a1f', fontWeight: '700', fontVariant: ['tabular-nums'] },
  perPersonBreak: { fontSize: 12, color: '#a09c92', marginTop: 4, fontVariant: ['tabular-nums'] },
  summaryActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#f1ecd9' },
  actionBtnPrimary: { backgroundColor: '#a87a1f' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#5a554c', fontSize: 14, fontWeight: '600' },
  actionBtnTextPrimary: { color: '#fff' },

  recent: { marginTop: 32 },
  recentTitle: { fontSize: 11, color: '#a09c92', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  recentRow: { flexDirection: 'row', backgroundColor: '#fffefb', borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#eee3c8', overflow: 'hidden' },
  recentMain: { flex: 1, padding: 12 },
  recentBill: { fontSize: 14, color: '#1a1815', fontWeight: '500', fontVariant: ['tabular-nums'] },
  recentSub: { fontSize: 12, color: '#a09c92', marginTop: 2, fontVariant: ['tabular-nums'] },
  recentDelete: { width: 40, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#eee3c8' },
  recentDeleteText: { fontSize: 18, color: '#bbb6a8' },
});
