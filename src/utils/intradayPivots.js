/**
 * Intraday pivot levels from four inputs: O, H, L, C (same session / reference bar).
 * Pivot = (H + C + L + O) / 4
 * R1 = (2 × Pivot) − L
 * S1 = (2 × Pivot) − H
 * R2 = Pivot + (R1 − S1)
 * S2 = Pivot − (R1 − S1)
 * R3 = H + 2 × (Pivot − L)
 * S3 = L − 2 × (H − Pivot)
 */
export function computeIntradayPivots(O, H, L, C) {
  const o = Number(O);
  const h = Number(H);
  const l = Number(L);
  const c = Number(C);
  if (![o, h, l, c].every((x) => Number.isFinite(x))) return null;

  const PP = (h + c + l + o) / 4;
  const R1 = 2 * PP - l;
  const S1 = 2 * PP - h;
  const R2 = PP + (R1 - S1);
  const S2 = PP - (R1 - S1);
  const R3 = h + 2 * (PP - l);
  const S3 = l - 2 * (h - PP);

  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    pp: round2(PP),
    r1: round2(R1),
    r2: round2(R2),
    r3: round2(R3),
    s1: round2(S1),
    s2: round2(S2),
    s3: round2(S3),
  };
}
