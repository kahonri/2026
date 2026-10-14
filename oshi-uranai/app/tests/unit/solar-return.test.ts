import { describe, it, expect } from "vitest";
import { findSolarReturn, profection, dignity } from "../../src/lib/solar-return";
import { eclipticLon } from "../../src/lib/ephemeris";

describe("solar-return", () => {
  it("太陽回帰の瞬間に、太陽が出生時の黄経へ戻っている", () => {
    const birth = new Date(Date.UTC(1990, 0, 14, 23, 30)); // 1990-01-15 08:30 JST
    const natal = eclipticLon("sun", birth);
    const sr = findSolarReturn(natal, new Date(Date.UTC(2026, 0, 15, 0, 0)));
    let d = Math.abs(eclipticLon("sun", sr) - natal);
    if (d > 180) d = 360 - d;
    expect(d).toBeLessThan(1e-4);
    // 誕生日の前後1日以内に来る
    expect(Math.abs(sr.getTime() - Date.UTC(2026, 0, 15, 0, 0))).toBeLessThan(2 * 86400_000);
  });

  it("プロフェクション：0歳は1ハウス、12歳でまた1ハウス、46歳は11ハウス", () => {
    expect(profection(0, 5).house).toBe(1);
    expect(profection(12, 5).house).toBe(1);
    const p = profection(46, 5); // 乙女座ASC・46歳 → 蟹座（11ハウス）・支配星は月
    expect(p.house).toBe(11);
    expect(p.sign).toBe(3);
    expect(p.lord).toBe("moon");
  });

  it("品位", () => {
    expect(dignity("jupiter", 3)).toBe("高揚");
    expect(dignity("saturn", 3)).toBe("障害");
    expect(dignity("venus", 5)).toBe("下降");
    expect(dignity("mars", 0)).toBe("本来の座");
  });
});
