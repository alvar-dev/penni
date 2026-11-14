import { StyleSheet, Text, View } from 'react-native';

import type { Viz as VizData } from '../content';
import { colors, type } from '../theme';
import { AccountsChart } from './charts/AccountsChart';
import { BasketsChart } from './charts/BasketsChart';
import { ColumnsChart } from './charts/ColumnsChart';
import { DonutChart } from './charts/DonutChart';
import { CountUp } from './charts/common';
import { ProjectionChart } from './charts/ProjectionChart';
import { RankingChart } from './charts/RankingChart';
import { ReplayChart } from './charts/ReplayChart';
import { RunwayChart } from './charts/RunwayChart';
import { TrendChart } from './charts/TrendChart';

/** The visual half of an answer: a label, the headline number and its chart. */
export function Viz({ viz, onConnect }: { viz: VizData; onConnect?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{viz.label}</Text>
      <CountUp value={viz.value} decimals={viz.kind === 'trend' || viz.kind === 'columns' ? 2 : 0} style={styles.figure} unitStyle={styles.figureUnit} />
      {viz.kind === 'trend' ? <TrendChart points={viz.points} average={viz.average} /> : null}
      {viz.kind === 'columns' ? <ColumnsChart bars={viz.bars} average={viz.average} /> : null}
      {viz.kind === 'donut' ? <DonutChart slices={viz.slices} total={viz.value} /> : null}
      {viz.kind === 'runway' ? (
        <RunwayChart points={viz.points} value={viz.value} perDay={viz.perDay} days={viz.days} paydayLabel={viz.paydayLabel} parts={viz.parts} />
      ) : null}
      {viz.kind === 'baskets' ? (
        <BasketsChart parts={viz.parts} share={viz.share} peerShare={viz.peerShare} peerLabel={viz.peerLabel} peerNote={viz.peerNote} />
      ) : null}
      {viz.kind === 'projection' ? (
        <ProjectionChart nowMonthly={viz.nowMonthly} afterMonthly={viz.afterMonthly} changeLabel={viz.changeLabel} yearly={viz.value} />
      ) : null}
      {viz.kind === 'ranking' ? <RankingChart rows={viz.rows} /> : null}
      {viz.kind === 'accounts' ? (
        <AccountsChart banks={viz.banks} connectable={viz.connectable && !!onConnect} footnote={viz.footnote} onConnect={onConnect} />
      ) : null}
      {viz.kind === 'replay' ? <ReplayChart points={viz.points} event={viz.event} overdrawnDays={viz.overdrawnDays} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  label: { ...type.caption, color: colors.textSecondary },
  figure: { ...type.hero, color: colors.green700, marginTop: 2, marginBottom: 6 },
  figureUnit: { fontSize: 28, fontWeight: '600', letterSpacing: 0 },
});
