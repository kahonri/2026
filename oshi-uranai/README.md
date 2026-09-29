# 推しの占い子 — フォルダ索引

最終更新：2026-09-30（古い文書を `docs/archive/`・`ig-main/archive/` へ移動。リールを追加）／2026-08-31（フォルダ再編）

**迷ったらこの表を見る。** 1フォルダ＝1担当スキルで対応させている。

---

## Instagramに出すもの（`ig-` で始まる）

| フォルダ | 中身 | 担当スキル | 状態 |
|---|---|---|---|
| `ig-main/` | **カルーセル・告知・ストーリーズの原稿**（1日1ファイル）。出さなかった原稿は `ig-main/archive/` | `oshi-uranai-ig` | 🟢 **現在の主軸** |
| `reel/` | **リール**（`make_reel.py`＋JSON設定・見本 `reel/examples/`） | `oshi-uranai-reel` | 🟢 **必須**（2026-09-29〜） |
| `ig-weekly/` | 12星座別の週間占い（`2026-Wnn_MMDD-MMDD.md`） | `oshi-uranai-weekly` | ⏸ 止まっている（最後はW35）。現行計画に入っていない |
| `ig-daily/` | 366日誕生日投稿・デーカン別ストック | `oshi-uranai-daily` | ⏸ **凍結**（再開ライン：フォロワー3,000） |
| `ig-photos/` | 投稿用の写真ストック `YYYY-MM/` | — | 🟢 **git管理外**（.gitignore） |

`ig-weekly/bk/` は旧稿・旧指示文のバックアップ。

---

## 設計書・仕様

| ファイル | 中身 |
|---|---|
| `docs/instagram-operation-design.md` | **Instagram運用方針の本体**（2026-08-31転換） |
| `docs/natal-reading-design.md` | 個人鑑定（出生図鑑定）の設計 |
| `docs/birthday-reading-design.md` | 誕生日投稿の読み方（⏸凍結中） |
| `docs/birthday-reminder-design.md` | 誕生日メール配信の設計 |
| `docs/birthday-reminder-form-spec.md` | 同・フォーム仕様 |
| **`docs/STATE.md`** | **現在地（最初に読む）** |
| `docs/posting-calendar.md` | いつ何を投稿するか |
| `docs/brand-concept.md` | ブランドの原本（2026-09-29） |
| `docs/natal-reading-2000-ops.md` | 出生図リーディング2,000円の受付・支払い・納品 |
| `docs/archive/` | 古い文書（旧STATE・relaunch-copy〈git管理外〉・launch-readiness・before-revision版など）。**流用しない** |

---

## 鑑定（個人情報）

| フォルダ | 中身 | 注意 |
|---|---|---|
| `kantei/` | 実際の鑑定文・フォーム回答 | ⚠️ **git管理外。リポジトリはPUBLIC。ここ以外に書かない・コミットしない** |
| `samples/` | 公開してよいサンプル鑑定 | 個人特定情報を含まないもののみ |

担当スキル：`oshi-uranai-kantei`

---

## Webアプリ

| フォルダ | 中身 |
|---|---|
| `app/` | アプリ本体（Astro）。`app/CLAUDE.md` に開発ルール |
| `app-copy/` | アプリ内テキストのリライト原稿（旧 `rewrite/`）。`STYLE.md` が文体基準 |
| `assets/app-ui/` | アプリUIのスクリーンショット・デザイン検討用 |
| `assets/form/` | フォーム用画像（ヘッダー等） |

---

## その他

| フォルダ | 中身 | 担当スキル |
|---|---|---|
| `clips/` | 動画素材・切り出し設定 | `video-clip-cutter` |
| `gas/` | Google Apps Script |  — |

---

## 天体計算

すべてのコンテンツで共通。**astro.com等のWeb読み取りは禁止**（星座記号を誤読するため）。

```bash
python .claude/skills/oshi-uranai-weekly/scripts/fetch_astro.py --week YYYY-Wnn
```

---

## 迷いやすいところ

- **いま作るインスタの投稿は2種類。** カルーセル等＝`ig-main/`、リール＝`reel/`。12星座別＝`ig-weekly/`（停止）と誕生日＝`ig-daily/`（凍結）は過去分。
- **設計書は `docs/` にしかない。** 直下に .md を置かない。
- **鑑定文は `kantei/` にしか書かない。** 他の場所に置くとPUBLICリポジトリに載る。
