import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBKTIKNTLDY_CblLZfYNLK1xt7ExYBVpPk",
  authDomain: "gocal-a4011.firebaseapp.com",
  projectId: "gocal-a4011",
  storageBucket: "gocal-a4011.firebasestorage.app",
  messagingSenderId: "428962770887",
  appId: "1:428962770887:web:b86464596a4f0981c1f3e2",
  measurementId: "G-6QR546FWB7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLORS = {
  bg: "#0f0f13", surface: "#1a1a22", card: "#22222e",
  accent: "#ff6b6b", accent2: "#ffd93d", accent3: "#6bcb77",
  text: "#f0f0f5", muted: "#888899", border: "#2e2e3e",
};

const STATUS_CONFIG = {
  "調整中": { color: COLORS.accent2, icon: "🔄" },
  "日程確定": { color: COLORS.accent3, icon: "✅" },
  "完了": { color: COLORS.muted, icon: "🏁" },
};

// ── 初期データ ──────────────────────────────
const INITIAL_GROUPS = [
  {
    id: 1, name: "田中チーム🍻", members: [
      { id: 1, name: "田中 蓮", age: 28, job: "エンジニア", emoji: "👨‍💻" },
      { id: 2, name: "鈴木 海斗", age: 26, job: "営業", emoji: "👔" },
      { id: 3, name: "山田 陸", age: 29, job: "デザイナー", emoji: "🎨" },
    ],
  },
  {
    id: 2, name: "中村チーム🎯", members: [
      { id: 7, name: "中村 颯", age: 27, job: "医師", emoji: "👨‍⚕️" },
      { id: 8, name: "小林 蒼", age: 25, job: "弁護士", emoji: "⚖️" },
      { id: 17, name: "高橋 凌", age: 26, job: "起業家", emoji: "🚀" },
    ],
  },
];

const INITIAL_EVENTS = [
  {
    id: 3, title: "先月の合コン🎊", status: "日程確定", createdAt: "5/10",
    confirmedDate: "5/20（火）19:00〜",
    myGroupId: 1,
    myGroup: [
      { id: 1, name: "田中 蓮", age: 28, job: "エンジニア", emoji: "👨‍💻" },
      { id: 2, name: "鈴木 海斗", age: 26, job: "営業", emoji: "👔" },
    ],
    theirGroup: [
      { id: 4, name: "佐藤 葵", age: 25, job: "看護師", emoji: "👩‍⚕️" },
      { id: 5, name: "伊藤 凛", age: 27, job: "教師", emoji: "👩‍🏫" },
    ],
    dates: [
      { id: 1, label: "5/20（火）19:00〜", answers: { 1: "○", 2: "○", 4: "○", 5: "○" } },
    ],
  },
  {
    id: 1, title: "春の合コン🌸", status: "調整中", createdAt: "6/1",
    myGroupId: 1,
    myGroup: [
      { id: 1, name: "田中 蓮", age: 28, job: "エンジニア", emoji: "👨‍💻" },
      { id: 2, name: "鈴木 海斗", age: 26, job: "営業", emoji: "👔" },
      { id: 3, name: "山田 陸", age: 29, job: "デザイナー", emoji: "🎨" },
    ],
    theirGroup: [
      { id: 4, name: "佐藤 葵", age: 25, job: "看護師", emoji: "👩‍⚕️" },
      { id: 5, name: "伊藤 凛", age: 27, job: "教師", emoji: "👩‍🏫" },
    ],
    dates: [
      { id: 1, label: "6/14（土）19:00〜", answers: { 1: "○", 2: "○", 3: "△", 4: "○", 5: "○" } },
      { id: 2, label: "6/21（土）18:30〜", answers: { 1: "○", 2: "△", 3: "○", 4: "○", 5: "△" } },
    ],
  },
];

// ── ユーティリティ ──────────────────────────
let _id = 200;
const genId = () => ++_id;

const answerColor = (a) =>
  a === "○" ? COLORS.accent3 : a === "△" ? COLORS.accent2 : a === "×" ? "#ff4d4d" : COLORS.muted;

const countScore = (answers) =>
  Object.values(answers).reduce((s, a) => s + (a === "○" ? 2 : a === "△" ? 1 : 0), 0);

const getResponseRate = (event) => {
  const all = [...event.myGroup, ...event.theirGroup];
  const total = all.length * event.dates.length;
  const answered = event.dates.reduce((s, d) =>
    s + Object.values(d.answers).filter(a => a && a !== "−").length, 0);
  return total > 0 ? Math.round((answered / total) * 100) : 0;
};

const today = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 確定日が過去なら「完了」に自動移行
// 確定日ラベル例: "6/14（土）19:00〜" → 年は現在年で補完
const isConfirmedDatePast = (confirmedDate) => {
  if (!confirmedDate) return false;
  const match = confirmedDate.match(/^(\d+)\/(\d+)/);
  if (!match) return false;
  const now = new Date();
  const year = now.getFullYear();
  const eventDate = new Date(year, parseInt(match[1]) - 1, parseInt(match[2]) + 1); // 翌日0時以降で完了
  return now >= eventDate;
};

const applyAutoComplete = (events) =>
  events.map(ev =>
    ev.status === "日程確定" && isConfirmedDatePast(ev.confirmedDate)
      ? { ...ev, status: "完了" }
      : ev
  );

// ── 共通UIパーツ ────────────────────────────
const Badge = ({ children, color }) => (
  <span style={{
    background: color + "22", color, border: `1px solid ${color}44`,
    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
  }}>{children}</span>
);

const Tab = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? COLORS.accent : "transparent",
    color: active ? "#fff" : COLORS.muted, border: "none",
    borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12,
    cursor: "pointer", fontFamily: "inherit",
  }}>{label}</button>
);

const BottomSheet = ({ children, onClose, title, subtitle }) => (
  <div style={{
    position: "fixed", inset: 0, background: "#000b", zIndex: 200,
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  }}>
    <div style={{
      background: COLORS.surface, borderRadius: "20px 20px 0 0",
      width: "100%", maxWidth: 480, padding: "24px 20px 48px",
      border: `1px solid ${COLORS.border}`, maxHeight: "90vh", overflowY: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
          {subtitle && <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{
          background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8,
          color: COLORS.muted, fontSize: 13, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
        }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const TextInput = ({ label, value, onChange, placeholder }) => (
  <div>
    {label && <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{label}</div>}
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: "100%", background: COLORS.card, border: `1px solid ${COLORS.border}`,
        borderRadius: 10, padding: "11px 14px", color: COLORS.text, fontSize: 14,
        fontFamily: "inherit", outline: "none", boxSizing: "border-box",
      }} />
  </div>
);

const PrimaryBtn = ({ children, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: "16px", borderRadius: 14,
    background: disabled ? COLORS.border : COLORS.accent,
    color: disabled ? COLORS.muted : "#fff", border: "none",
    fontWeight: 800, fontSize: 15, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", transition: "all 0.2s",
  }}>{children}</button>
);

// ── グループ作成・編集モーダル ──────────────
function GroupEditModal({ existing, onSave, onClose }) {
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name || "");
  const [members, setMembers] = useState(
    existing?.members.map(m => ({ ...m })) || [{ id: genId(), name: "" }]
  );

  const addMember = () => setMembers(p => [...p, { id: genId(), name: "" }]);
  const removeMember = (id) => setMembers(p => p.filter(m => m.id !== id));
  const updateName = (id, val) => setMembers(p => p.map(m => m.id === id ? { ...m, name: val } : m));
  const canSave = name.trim() && members.every(m => m.name.trim());

  const memberInputStyle = {
    width: "100%", background: COLORS.surface, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: "11px 14px", color: COLORS.text, fontSize: 14,
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  return (
    <BottomSheet
      title={isEdit ? "グループを編集" : "グループを作成"}
      subtitle="メンバーの名前を入力してください"
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <TextInput label="グループ名" value={name} onChange={setName} placeholder="例：田中チーム" />
        <div>
          <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 10 }}>
            メンバー（{members.length}人）
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m, i) => (
              <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={m.name}
                  onChange={e => updateName(m.id, e.target.value)}
                  placeholder={`メンバー ${i + 1}の名前`}
                  style={{ ...memberInputStyle, flex: 1 }}
                />
                {members.length > 1 && (
                  <button onClick={() => removeMember(m.id)} style={{
                    background: COLORS.card, border: `1px solid ${COLORS.border}`,
                    borderRadius: 8, color: "#ff4d4d", fontSize: 14,
                    padding: "10px 12px", cursor: "pointer",
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addMember} style={{
            width: "100%", marginTop: 8, padding: "12px", borderRadius: 10,
            background: "transparent", border: `1.5px dashed ${COLORS.border}`,
            color: COLORS.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>＋ メンバーを追加</button>
        </div>
        <PrimaryBtn
          onClick={() => canSave && onSave({ id: existing?.id || genId(), name, members })}
          disabled={!canSave}
        >
          {isEdit ? "変更を保存する" : "グループを作成する"}
        </PrimaryBtn>
      </div>
    </BottomSheet>
  );
}

// ── カレンダーコンポーネント ────────────────
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
// ── ドラム式時間ピッカー ────────────────────
function TimePicker({ value, onChange }) {
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  const parseTime = (t) => {
    const m = t?.match(/(\d{2}):(\d{2})/);
    return m ? { h: m[1], min: m[2] } : { h: "19", min: "00" };
  };
  const { h: selH, min: selMin } = parseTime(value);

  const itemH = 40;

  const DrumReel = ({ items, selected, onSelect }) => {
    const idx = items.indexOf(selected);
    const ref = React.useRef(null);

    React.useEffect(() => {
      if (ref.current) {
        ref.current.scrollTop = idx * itemH;
      }
    }, []);

    const handleScroll = (e) => {
      const scrollTop = e.target.scrollTop;
      const newIdx = Math.round(scrollTop / itemH);
      if (items[newIdx] && items[newIdx] !== selected) {
        onSelect(items[newIdx]);
      }
    };

    return (
      <div style={{ position: "relative", width: 64, height: itemH * 3, overflow: "hidden" }}>
        {/* 選択ハイライト */}
        <div style={{
          position: "absolute", top: itemH, left: 0, right: 0, height: itemH,
          background: COLORS.accent + "22", border: `1px solid ${COLORS.accent}44`,
          borderRadius: 8, pointerEvents: "none", zIndex: 1,
        }} />
        <div
          ref={ref}
          onScroll={handleScroll}
          style={{
            height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory",
            scrollbarWidth: "none", msOverflowStyle: "none",
          }}
        >
          {/* 上下のパディング用ダミー */}
          <div style={{ height: itemH }} />
          {items.map(item => (
            <div
              key={item}
              onClick={() => onSelect(item)}
              style={{
                height: itemH, display: "flex", alignItems: "center", justifyContent: "center",
                scrollSnapAlign: "start", cursor: "pointer",
                color: item === selected ? COLORS.accent : COLORS.muted,
                fontWeight: item === selected ? 900 : 400,
                fontSize: item === selected ? 20 : 16,
                transition: "all 0.15s",
              }}
            >{item}</div>
          ))}
          <div style={{ height: itemH }} />
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: COLORS.card, borderRadius: 14, padding: "16px",
      border: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    }}>
      <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700 }}>開始時間</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DrumReel items={hours} selected={selH} onSelect={h => onChange(`${h}:${selMin}〜`)} />
        <span style={{ color: COLORS.text, fontWeight: 900, fontSize: 20 }}>:</span>
        <DrumReel items={minutes} selected={selMin} onSelect={min => onChange(`${selH}:${min}〜`)} />
      </div>
      <div style={{ color: COLORS.accent, fontWeight: 800, fontSize: 16 }}>{selH}:{selMin}〜</div>
    </div>
  );
}

function MiniCalendar({ selectedDates, onToggleDate }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const toKey = (y, m, d) => `${y}-${m}-${d}`;
  const isPast = (d) => new Date(viewYear, viewMonth, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isSelected = (d) => selectedDates.some(s => s.dateKey === toKey(viewYear, viewMonth, d));

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ background: COLORS.card, borderRadius: 14, padding: "14px", border: `1px solid ${COLORS.border}` }}>
      {/* 月ナビ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={prevMonth} style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
          color: COLORS.muted, width: 32, height: 32, cursor: "pointer", fontSize: 16,
        }}>‹</button>
        <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 15 }}>
          {viewYear}年 {viewMonth + 1}月
        </div>
        <button onClick={nextMonth} style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
          color: COLORS.muted, width: 32, height: 32, cursor: "pointer", fontSize: 16,
        }}>›</button>
      </div>

      {/* 曜日ヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{
            textAlign: "center", fontSize: 11, fontWeight: 700, padding: "4px 0",
            color: i === 0 ? "#ff6b6b" : i === 6 ? "#4da6ff" : COLORS.muted,
          }}>{w}</div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const past = isPast(d);
          const sel = isSelected(d);
          const dow = (firstDay + d - 1) % 7;
          const isSun = dow === 0, isSat = dow === 6;
          return (
            <button key={d} onClick={() => !past && onToggleDate(toKey(viewYear, viewMonth, d), viewYear, viewMonth, d, dow)}
              disabled={past}
              style={{
                aspectRatio: "1", borderRadius: 8, border: "none", cursor: past ? "default" : "pointer",
                fontWeight: sel ? 900 : 500, fontSize: 13, fontFamily: "inherit",
                background: sel ? COLORS.accent : past ? "transparent" : COLORS.surface,
                color: sel ? "#fff" : past ? COLORS.border : isSun ? "#ff6b6b" : isSat ? "#4da6ff" : COLORS.text,
                transition: "all 0.15s",
              }}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── 時間選択ポップオーバー ──────────────────
function TimeSelector({ dateEntry, onSetTime, onRemove }) {
  const dow = WEEKDAYS[dateEntry.dow];
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.accent}44`,
      borderRadius: 14, padding: "14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>
          {dateEntry.month + 1}/{dateEntry.day}（{dow}）
        </div>
        <button onClick={() => onRemove(dateEntry.dateKey)} style={{
          background: "none", border: "none", color: "#ff4d4d", fontSize: 18,
          cursor: "pointer", padding: "4px",
        }}>✕</button>
      </div>
      <TimePicker value={dateEntry.time} onChange={t => onSetTime(dateEntry.dateKey, t)} />
    </div>
  );
}

// ── イベント作成モーダル ────────────────────
function CreateEventModal({ groups, onSave, onClose }) {
  const [step, setStep] = useState(1); // 1:タイトル&グループ  2:候補日
  const [title, setTitle] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  // selectedDates: [{ dateKey, year, month, day, dow, time }]
  const [selectedDates, setSelectedDates] = useState([]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const toggleDate = (dateKey, year, month, day, dow) => {
    setSelectedDates(prev => {
      const exists = prev.find(d => d.dateKey === dateKey);
      if (exists) return prev.filter(d => d.dateKey !== dateKey);
      return [...prev, { dateKey, year, month, day, dow, time: "19:00〜" }];
    });
  };

  const setTime = (dateKey, time) => {
    setSelectedDates(prev => prev.map(d => d.dateKey === dateKey ? { ...d, time } : d));
  };

  const removeDate = (dateKey) => setSelectedDates(prev => prev.filter(d => d.dateKey !== dateKey));

  const canStep1 = title.trim() && selectedGroupId;
  const canSave = selectedDates.length > 0;

  const handleSave = () => {
    if (!canSave || !selectedGroup) return;
    const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
    const eventDates = selectedDates
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(d => ({
        id: genId(),
        label: `${d.month + 1}/${d.day}（${WDAYS[d.dow]}）${d.time}`,
        answers: Object.fromEntries(selectedGroup.members.map(m => [m.id, ""])),
      }));
    onSave({
      id: genId(), title, status: "調整中", createdAt: today(),
      myGroupId: selectedGroupId, myGroup: selectedGroup.members,
      theirGroup: [], dates: eventDates,
    });
  };

  return (
    <BottomSheet
      title={step === 1 ? "合コンを作成" : "📅 候補日を選ぶ"}
      subtitle={step === 1 ? "①タイトルとグループを設定" : "②カレンダーから複数日選択できます"}
      onClose={onClose}
    >
      {step === 1 ? (
        <div style={{ display: "grid", gap: 18 }}>
          <TextInput label="タイトル" value={title} onChange={setTitle} placeholder="例：夏の合コン🍺" />

          <div>
            <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>自分側グループを選ぶ</div>
            {groups.length === 0 ? (
              <div style={{
                background: COLORS.card, border: `1px solid ${COLORS.border}`,
                borderRadius: 12, padding: "16px", textAlign: "center", color: COLORS.muted, fontSize: 13,
              }}>グループがまだありません。先にグループを作成してください。</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {groups.map(g => {
                  const sel = selectedGroupId === g.id;
                  return (
                    <button key={g.id} onClick={() => setSelectedGroupId(g.id)} style={{
                      background: sel ? COLORS.accent + "18" : COLORS.card,
                      border: `2px solid ${sel ? COLORS.accent : COLORS.border}`,
                      borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}>
                      <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                        {sel ? "✅ " : ""}{g.name}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {g.members.map(m => (
                          <span key={m.id} style={{
                            background: COLORS.accent + "22", borderRadius: 20,
                            padding: "2px 8px", fontSize: 11, color: COLORS.text, fontWeight: 600,
                          }}>{m.name}</span>
                        ))}
                        <span style={{ color: COLORS.muted, fontSize: 11 }}>{g.members.length}人</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <PrimaryBtn onClick={() => canStep1 && setStep(2)} disabled={!canStep1}>
            次へ：候補日を選ぶ →
          </PrimaryBtn>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {/* 戻るボタン */}
          <button onClick={() => setStep(1)} style={{
            background: "none", border: "none", color: COLORS.muted,
            fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left",
          }}>← タイトル・グループの設定に戻る</button>

          <MiniCalendar selectedDates={selectedDates} onToggleDate={toggleDate} />

          {/* 選択済み日程 */}
          {selectedDates.length > 0 && (
            <div>
              <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                選択中の候補日（{selectedDates.length}件）― 時間をタップして変更
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {[...selectedDates]
                  .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
                  .map(d => (
                    <TimeSelector key={d.dateKey} dateEntry={d} onSetTime={setTime} onRemove={removeDate} />
                  ))}
              </div>
            </div>
          )}

          <PrimaryBtn onClick={handleSave} disabled={!canSave}>
            {canSave ? `この${selectedDates.length}日程で合コンを作成 🎉` : "候補日を1日以上選んでください"}
          </PrimaryBtn>
        </div>
      )}
    </BottomSheet>
  );
}

// ── 相手メンバー追加モーダル ────────────────
function AddTheirMemberModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  const canSave = name.trim();
  return (
    <BottomSheet title="相手メンバーを追加" subtitle="名前を入力してください" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        <TextInput label="名前（必須）" value={name} onChange={setName} placeholder="例：佐藤 葵" />
        <PrimaryBtn onClick={() => canSave && onSave({ id: genId(), name })} disabled={!canSave}>
          追加する
        </PrimaryBtn>
      </div>
    </BottomSheet>
  );
}

// ── 回答入力モーダル ────────────────────────
function AnswerInputModal({ event, member, onSave, onClose }) {
  const [answers, setAnswers] = useState(
    Object.fromEntries(event.dates.map(d => [d.id, d.answers[member.id] || ""]))
  );
  const allFilled = event.dates.every(d => answers[d.id]);

  return (
    <BottomSheet title="スケジュール入力" subtitle={`${member.emoji} ${member.name}さんの回答`} onClose={onClose}>
      <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
        {event.dates.map(d => (
          <div key={d.id}>
            <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📅 {d.label}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["○", "△", "×"].map(opt => {
                const sel = answers[d.id] === opt;
                const col = answerColor(opt);
                return (
                  <button key={opt} onClick={() => setAnswers(p => ({ ...p, [d.id]: opt }))} style={{
                    flex: 1, padding: "14px 0", borderRadius: 12, cursor: "pointer",
                    fontWeight: 900, fontSize: 22, fontFamily: "inherit",
                    background: sel ? col + "33" : COLORS.card,
                    border: `2px solid ${sel ? col : COLORS.border}`,
                    color: sel ? col : COLORS.muted,
                    transform: sel ? "scale(1.05)" : "scale(1)", transition: "all 0.15s",
                  }}>{opt}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <PrimaryBtn onClick={() => allFilled && onSave(answers)} disabled={!allFilled}>
        {allFilled ? "✅ 回答を保存する" : "全ての日程を選んでください"}
      </PrimaryBtn>
    </BottomSheet>
  );
}

// ── メンバー選択モーダル ────────────────────
function MemberSelectModal({ event, onSelect, onClose }) {
  const all = [...event.myGroup, ...event.theirGroup];
  return (
    <BottomSheet title="あなたはだれですか？" subtitle="自分の名前を選んでください" onClose={onClose}>
      <div style={{ display: "grid", gap: 8 }}>
        {all.map(m => (
          <button key={m.id} onClick={() => onSelect(m)} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: "14px 16px", cursor: "pointer",
            textAlign: "left", fontFamily: "inherit",
          }}>
            <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 15 }}>{m.name}</div>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ── 候補日編集モーダル ──────────────────────
function EditDatesModal({ event, onSave, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const WEEKDAYS2 = ["日","月","火","水","木","金","土"];


  const parseExisting = () => event.dates.map(d => {
    const m = d.label.match(/^(\d+)\/(\d+)/);
    const dow = d.label.match(/（(.)）/);
    const dowIdx = dow ? WEEKDAYS2.indexOf(dow[1]) : 0;
    const month = m ? parseInt(m[1]) - 1 : now.getMonth();
    const day = m ? parseInt(m[2]) : 1;
    const time = d.label.split("）")[1] || "19:00〜";
    return {
      dateKey: `${now.getFullYear()}-${month + 1}-${day}`,
      year: now.getFullYear(), month, day, dow: dowIdx, time,
      existingId: d.id, existingAnswers: d.answers,
    };
  });

  const [selectedDates, setSelectedDates] = useState(parseExisting);

  const toKey = (y, m, d) => `${y}-${m}-${d}`;
  const isPast = (d) => new Date(viewYear, viewMonth, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isSelected = (d) => selectedDates.some(s => s.dateKey === toKey(viewYear, viewMonth, d));

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const toggleDate = (dateKey, year, month, day, dow) => {
    setSelectedDates(prev => {
      const exists = prev.find(d => d.dateKey === dateKey);
      if (exists) return prev.filter(d => d.dateKey !== dateKey);
      const existing = event.dates.find(d => {
        const m2 = d.label.match(/^(\d+)\/(\d+)/);
        return m2 && parseInt(m2[1]) === month + 1 && parseInt(m2[2]) === day;
      });
      return [...prev, { dateKey, year, month, day, dow, time: "19:00〜", existingId: existing?.id || null, existingAnswers: existing?.answers || {} }];
    });
  };

  const setTime = (dateKey, time) => setSelectedDates(prev => prev.map(d => d.dateKey === dateKey ? { ...d, time } : d));
  const removeDate = (dateKey) => setSelectedDates(prev => prev.filter(d => d.dateKey !== dateKey));

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const canSave = selectedDates.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const allMembers = [...event.myGroup, ...event.theirGroup];
    const newDates = [...selectedDates]
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map(d => ({
        id: d.existingId || genId(),
        label: `${d.month + 1}/${d.day}（${WEEKDAYS2[d.dow]}）${d.time}`,
        answers: Object.fromEntries(allMembers.map(m => [m.id, d.existingAnswers?.[m.id] || ""])),
      }));
    onSave(newDates);
  };

  return (
    <BottomSheet title="候補日を編集" subtitle="日付をタップして追加・削除できます" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ background: COLORS.card, borderRadius: 14, padding: "14px", border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button onClick={prevMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.muted, width: 32, height: 32, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>‹</button>
            <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 15 }}>{viewYear}年 {viewMonth + 1}月</div>
            <button onClick={nextMonth} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.muted, width: 32, height: 32, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
            {WEEKDAYS2.map((w, i) => (
              <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, padding: "4px 0", color: i === 0 ? "#ff6b6b" : i === 6 ? "#4da6ff" : COLORS.muted }}>{w}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const past = isPast(d);
              const sel = isSelected(d);
              const dow = (firstDay + d - 1) % 7;
              return (
                <button key={d} onClick={() => !past && toggleDate(toKey(viewYear, viewMonth, d), viewYear, viewMonth, d, dow)} disabled={past} style={{
                  aspectRatio: "1", borderRadius: 8, border: "none", cursor: past ? "default" : "pointer",
                  fontWeight: sel ? 900 : 500, fontSize: 13, fontFamily: "inherit",
                  background: sel ? COLORS.accent : past ? "transparent" : COLORS.surface,
                  color: sel ? "#fff" : past ? COLORS.border : dow === 0 ? "#ff6b6b" : dow === 6 ? "#4da6ff" : COLORS.text,
                }}>{d}</button>
              );
            })}
          </div>
        </div>

        {selectedDates.length > 0 && (
          <div>
            <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>候補日（{selectedDates.length}件）</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[...selectedDates].sort((a, b) => a.dateKey.localeCompare(b.dateKey)).map(d => (
                <div key={d.dateKey} style={{ background: COLORS.card, border: `1px solid ${COLORS.accent}44`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      {d.month + 1}/{d.day}（{WEEKDAYS2[d.dow]}）
                      {d.existingAnswers && Object.values(d.existingAnswers).some(a => a) && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.accent3, background: COLORS.accent3 + "22", borderRadius: 6, padding: "2px 6px" }}>回答引継ぎ</span>
                      )}
                    </div>
                    <TimePicker value={d.time} onChange={t => setTime(d.dateKey, t)} />
                  </div>
                  <button onClick={() => removeDate(d.dateKey)} style={{ background: "none", border: "none", color: "#ff4d4d", fontSize: 18, cursor: "pointer", padding: "4px" }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <PrimaryBtn onClick={handleSave} disabled={!canSave}>
          {canSave ? `${selectedDates.length}件の候補日で更新する` : "候補日を1日以上選んでください"}
        </PrimaryBtn>
      </div>
    </BottomSheet>
  );
}

// ── 削除確認モーダル ────────────────────────
function DeleteConfirmModal({ title, onConfirm, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000c", zIndex: 300,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }}>
      <div style={{
        background: COLORS.surface, borderRadius: 20, padding: "28px 24px",
        width: "100%", maxWidth: 360, border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 14 }}>🗑️</div>
        <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 16, textAlign: "center", marginBottom: 8 }}>
          削除しますか？
        </div>
        <div style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", marginBottom: 24 }}>
          「{title}」を削除します。この操作は取り消せません。
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={onClose} style={{
            padding: "14px", borderRadius: 12, background: COLORS.card,
            border: `1px solid ${COLORS.border}`, color: COLORS.text,
            fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>キャンセル</button>
          <button onClick={onConfirm} style={{
            padding: "14px", borderRadius: 12, background: "#ff4d4d",
            border: "none", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>削除する</button>
        </div>
      </div>
    </div>
  );
}

// ── 日程確定モーダル ────────────────────────
function ConfirmDateModal({ scores, onConfirm, onClose }) {
  const maxScore = Math.max(...scores.map(s => s.score));
  const [selected, setSelected] = useState(scores.find(s => s.score === maxScore)?.id ?? scores[0].id);

  return (
    <BottomSheet title="日程を確定する" subtitle="確定する日程を選んでください" onClose={onClose}>
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {scores.map(d => {
          const isBest = d.score === maxScore;
          const isSel = selected === d.id;
          return (
            <button key={d.id} onClick={() => setSelected(d.id)} style={{
              background: isSel ? COLORS.accent3 + "20" : COLORS.card,
              border: `2px solid ${isSel ? COLORS.accent3 : COLORS.border}`,
              borderRadius: 14, padding: "14px 16px", cursor: "pointer",
              textAlign: "left", fontFamily: "inherit", transition: "all 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isBest && <span style={{ fontSize: 16 }}>⭐</span>}
                  <div>
                    <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{d.label}</div>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
                      スコア {d.score}pt
                      {isBest && <span style={{ color: COLORS.accent2, marginLeft: 6 }}>最有力</span>}
                    </div>
                  </div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  border: `2px solid ${isSel ? COLORS.accent3 : COLORS.border}`,
                  background: isSel ? COLORS.accent3 : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSel && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <PrimaryBtn onClick={() => onConfirm(scores.find(s => s.id === selected))}>
        この日程で確定する 🎉
      </PrimaryBtn>
    </BottomSheet>
  );
}

// ── 日程調整ビュー ──────────────────────────
function ScheduleView({ event, onAnswerUpdate, onConfirmDate, onRevertDate, onUpdateDates }) {
  const allMembers = [...event.myGroup, ...event.theirGroup];
  const scores = event.dates.map(d => ({ ...d, score: countScore(d.answers) }));
  const maxScore = Math.max(...scores.map(s => s.score));
  const bestDate = scores.find(s => s.score === maxScore);
  const [showMemberSelect, setShowMemberSelect] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEditDates, setShowEditDates] = useState(false);
  const [toast, setToast] = useState(null); // null | "saved" | "confirmed"

  const handleSave = (answers) => {
    onAnswerUpdate(event.id, selectedMember.id, answers);
    setSelectedMember(null);
    setToast("saved");
    setTimeout(() => setToast(null), 2500);
  };

  const handleConfirm = (date) => {
    onConfirmDate(event.id, date.label);
    setShowConfirm(false);
    setToast("confirmed");
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdateDates = (newDates) => {
    onUpdateDates(event.id, newDates);
    setShowEditDates(false);
    setToast("updated");
    setTimeout(() => setToast(null), 2500);
  };

  const isConfirmed = event.status === "日程確定";

  return (
    <div>
      {/* 確定済みバナー */}
      {isConfirmed && (
        <div style={{
          background: COLORS.accent3 + "18", border: `1.5px solid ${COLORS.accent3}55`,
          borderRadius: 14, padding: "16px 18px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 28 }}>🎉</span>
          <div>
            <div style={{ color: COLORS.accent3, fontWeight: 800, fontSize: 14 }}>日程確定済み</div>
            <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 15, marginTop: 2 }}>{event.confirmedDate}</div>
          </div>
        </div>
      )}

      {/* 調整中に戻すボタン（確定時のみ） */}
      {isConfirmed && (
        <button onClick={() => onRevertDate(event.id)} style={{
          width: "100%", padding: "11px", marginBottom: 20, borderRadius: 12,
          background: "transparent", border: `1px solid ${COLORS.border}`,
          color: COLORS.muted, fontWeight: 700, fontSize: 13,
          cursor: "pointer", fontFamily: "inherit",
        }}>↩ 調整中に戻す</button>
      )}

      {/* 候補日を編集するボタン（常時表示） */}
      <button onClick={() => setShowEditDates(true)} style={{
        width: "100%", padding: "11px", marginBottom: 10, borderRadius: 12,
        background: "transparent", border: `1px solid ${COLORS.border}`,
        color: COLORS.muted, fontWeight: 700, fontSize: 13,
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>📅 候補日を編集する</button>

      {/* スケジュール入力ボタン（未確定時のみ） */}
      {!isConfirmed && (
        <button onClick={() => setShowMemberSelect(true)} style={{
          width: "100%", padding: "14px", marginBottom: 16, borderRadius: 14,
          background: COLORS.accent + "18", border: `1.5px dashed ${COLORS.accent}`,
          color: COLORS.accent, fontWeight: 800, fontSize: 14,
          cursor: "pointer", fontFamily: "inherit",
        }}>✏️ 自分のスケジュールを入力する</button>
      )}

      {/* トースト */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: toast === "confirmed" ? COLORS.accent3 : COLORS.accent3,
          color: "#fff", borderRadius: 12, padding: "10px 20px",
          fontWeight: 700, fontSize: 14, zIndex: 300, whiteSpace: "nowrap",
          boxShadow: "0 4px 20px #0006",
        }}>
          {toast === "confirmed" ? "🎉 日程を確定しました！" : toast === "updated" ? "📅 候補日を更新しました！" : "✅ 回答を保存しました！"}
        </div>
      )}

      <p style={{ color: COLORS.muted, fontSize: 12, marginBottom: 12 }}>○=参加可　△=未定　×=不可</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px", color: COLORS.muted, fontWeight: 600, minWidth: 130 }}>日程</th>
              {allMembers.map(m => (
                <th key={m.id} style={{ padding: "8px 6px", color: COLORS.muted, textAlign: "center", minWidth: 42, fontSize: 9 }}>
                  {m.name.split(" ")[0]}
                </th>
              ))}
              <th style={{ padding: "8px 8px", color: COLORS.muted, textAlign: "center" }}>Pt</th>
            </tr>
          </thead>
          <tbody>
            {scores.map(d => {
              const isConfirmedRow = isConfirmed && d.label === event.confirmedDate;
              return (
                <tr key={d.id} style={{
                  background: isConfirmedRow
                    ? COLORS.accent3 + "18"
                    : d.score === maxScore ? COLORS.accent + "15" : "transparent",
                }}>
                  <td style={{ padding: "10px 10px", color: COLORS.text, fontWeight: d.score === maxScore ? 700 : 400, fontSize: 12 }}>
                    {isConfirmedRow ? "✅ " : d.score === maxScore ? "⭐" : ""}{d.label}
                  </td>
                  {allMembers.map(m => (
                    <td key={m.id} style={{ textAlign: "center", padding: "8px 4px" }}>
                      <span style={{
                        display: "inline-block", width: 26, height: 26, lineHeight: "26px",
                        borderRadius: 6, fontWeight: 700, fontSize: 13,
                        background: d.answers[m.id] ? answerColor(d.answers[m.id]) + "22" : COLORS.border + "33",
                        color: d.answers[m.id] ? answerColor(d.answers[m.id]) : COLORS.border,
                      }}>{d.answers[m.id] || "−"}</span>
                    </td>
                  ))}
                  <td style={{ textAlign: "center", padding: "8px 8px" }}>
                    <span style={{ color: d.score === maxScore ? COLORS.accent2 : COLORS.muted, fontWeight: 700 }}>{d.score}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 最有力表示 ＋ 確定ボタン（未確定時のみ） */}
      {!isConfirmed && scores.length > 0 && maxScore > 0 && (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div style={{
            padding: "12px 16px",
            background: COLORS.accent3 + "15", border: `1px solid ${COLORS.accent3}33`,
            borderRadius: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>💡</span>
            <span style={{ color: COLORS.accent3, fontSize: 13, fontWeight: 600 }}>
              最有力：{bestDate?.label}
            </span>
          </div>
          <button onClick={() => setShowConfirm(true)} style={{
            width: "100%", padding: "16px", borderRadius: 14,
            background: `linear-gradient(135deg, ${COLORS.accent3}, #4db86e)`,
            border: "none", color: "#fff", fontWeight: 900, fontSize: 15,
            cursor: "pointer", fontFamily: "inherit",
            boxShadow: `0 6px 20px ${COLORS.accent3}44`,
          }}>
            📅 日程を確定する
          </button>
        </div>
      )}

      {showMemberSelect && !selectedMember && (
        <MemberSelectModal event={event} onSelect={m => { setSelectedMember(m); setShowMemberSelect(false); }} onClose={() => setShowMemberSelect(false)} />
      )}
      {selectedMember && (
        <AnswerInputModal event={event} member={selectedMember} onSave={handleSave} onClose={() => setSelectedMember(null)} />
      )}
      {showConfirm && (
        <ConfirmDateModal scores={scores} onConfirm={handleConfirm} onClose={() => setShowConfirm(false)} />
      )}
      {showEditDates && (
        <EditDatesModal event={event} onSave={handleUpdateDates} onClose={() => setShowEditDates(false)} />
      )}
    </div>
  );
}

// ── 出欠ビュー ──────────────────────────────
function AttendanceView({ event, onUpdateAttendance }) {
  const allMembers = [...event.myGroup, ...event.theirGroup];

  // 確定日の回答から自動セット（初期値）
  const getInitialStatus = (m) => {
    if (event.attendance && event.attendance[m.id] !== undefined) {
      return event.attendance[m.id];
    }
    if (!event.confirmedDate) return "未定";
    const confirmedDateObj = event.dates?.find(d => d.label === event.confirmedDate);
    if (!confirmedDateObj) return "未定";
    const ans = confirmedDateObj.answers?.[m.id];
    if (ans === "○") return "参加";
    if (ans === "×") return "不参加";
    return "未定";
  };

  const STATUS_OPTIONS = ["参加", "不参加", "未定"];
  const statusColor = (s) => s === "参加" ? COLORS.accent3 : s === "不参加" ? "#ff4d4d" : COLORS.muted;

  const attendance = event.attendance || {};
  const counts = {
    参加: allMembers.filter(m => getInitialStatus(m) === "参加").length,
    不参加: allMembers.filter(m => getInitialStatus(m) === "不参加").length,
    未定: allMembers.filter(m => getInitialStatus(m) === "未定").length,
  };

  return (
    <div>
      {/* サマリー */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[["参加", COLORS.accent3], ["不参加", "#ff4d4d"], ["未定", COLORS.muted]].map(([label, color]) => (
          <div key={label} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: "12px", textAlign: "center",
          }}>
            <div style={{ color, fontSize: 22, fontWeight: 900 }}>{counts[label]}</div>
            <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* メンバーごとの出欠 */}
      {[
        { label: "自分側 🫂", data: event.myGroup },
        { label: "相手側 💫", data: event.theirGroup },
      ].map(({ label, data }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{label}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.map(m => {
              const status = getInitialStatus(m);
              return (
                <div key={m.id} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 12, padding: "12px 14px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{m.name}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => onUpdateAttendance(event.id, m.id, opt)} style={{
                        padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                        background: status === opt ? statusColor(opt) + "33" : COLORS.surface,
                        color: status === opt ? statusColor(opt) : COLORS.muted,
                        border: `1px solid ${status === opt ? statusColor(opt) : COLORS.border}`,
                      }}>{opt}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── メンバービュー（相手追加ボタン付き） ─────
function MembersView({ event, onAddTheirMember }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {[
        { label: "自分側グループ 🫂", data: event.myGroup, color: COLORS.accent },
        { label: "相手グループ 💫", data: event.theirGroup, color: COLORS.accent2, showAdd: true },
      ].map(({ label, data, color, showAdd: sa }) => (
        <div key={label}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ color, fontSize: 11, fontWeight: 700 }}>{label}</div>
            {sa && (
              <button onClick={() => setShowAdd(true)} style={{
                background: color + "22", border: `1px solid ${color}44`, borderRadius: 8,
                color, fontSize: 11, fontWeight: 700, padding: "4px 10px",
                cursor: "pointer", fontFamily: "inherit",
              }}>＋ 追加</button>
            )}
          </div>
          {data.length === 0 ? (
            <div style={{
              background: COLORS.card, border: `1.5px dashed ${COLORS.border}`,
              borderRadius: 12, padding: "20px", textAlign: "center",
              color: COLORS.muted, fontSize: 13,
            }}>
              まだメンバーがいません
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.map(m => (
                <span key={m.id} style={{
                  background: color + "18", border: `1px solid ${color}33`,
                  borderRadius: 20, padding: "6px 14px", color: COLORS.text, fontSize: 14, fontWeight: 600,
                }}>{m.name}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <AddTheirMemberModal
          onSave={m => { onAddTheirMember(m); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ── 割り勘ビュー ────────────────────────────
function SplitView({ event }) {
  const [total, setTotal] = useState("");
  const [maleAmt, setMaleAmt] = useState("");
  const [femaleAmt, setFemaleAmt] = useState("");
  const [mode, setMode] = useState("equal");
  const members = [...event.myGroup, ...event.theirGroup];
  const mC = event.myGroup.length, fC = event.theirGroup.length;
  const tN = parseFloat(total) || 0;
  const mV = parseFloat(maleAmt) || 0, fV = parseFloat(femaleAmt) || 0;
  const customTotal = mV * mC + fV * fC;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>合計金額（円）</div>
        <input type="number" placeholder="例: 48000" value={total} onChange={e => setTotal(e.target.value)} style={{
          width: "100%", background: COLORS.card, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: "12px 14px", color: COLORS.text, fontSize: 20,
          fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
        }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {[["equal", "均等割り"], ["gender", "男女別"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            flex: 1, padding: "10px",
            background: mode === id ? COLORS.accent : COLORS.card,
            color: mode === id ? "#fff" : COLORS.muted,
            border: `1px solid ${mode === id ? COLORS.accent : COLORS.border}`,
            borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>{lbl}</button>
        ))}
      </div>
      {mode === "equal" && tN > 0 && (
        <div style={{
          background: COLORS.accent + "15", border: `1px solid ${COLORS.accent}33`,
          borderRadius: 14, padding: "20px", textAlign: "center",
        }}>
          <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 4 }}>1人あたり</div>
          <div style={{ color: COLORS.accent, fontSize: 36, fontWeight: 900 }}>¥{Math.ceil(tN / members.length).toLocaleString()}</div>
          <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>{members.length}人で割り勘</div>
        </div>
      )}
      {mode === "gender" && (
        <div style={{ display: "grid", gap: 10 }}>
          {[[`男性（${mC}人）`, maleAmt, setMaleAmt, "#4da6ff"], [`女性（${fC}人）`, femaleAmt, setFemaleAmt, COLORS.accent]].map(([lbl, val, set, col]) => (
            <div key={lbl}>
              <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{lbl}</div>
              <input type="number" placeholder="円/人" value={val} onChange={e => set(e.target.value)} style={{
                width: "100%", background: COLORS.card, border: `1px solid ${col}44`,
                borderRadius: 10, padding: "10px 14px", color: col, fontSize: 18,
                fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              }} />
            </div>
          ))}
          {(mV > 0 || fV > 0) && (
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 18px", display: "grid", gap: 8 }}>
              {[[`男性合計`, mV * mC, "#4da6ff"], [`女性合計`, fV * fC, COLORS.accent]].map(([lbl, val, col]) => (
                <div key={lbl} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.muted, fontSize: 12 }}>{lbl}</span>
                  <span style={{ color: col, fontWeight: 700 }}>¥{val.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: COLORS.text, fontWeight: 700 }}>合計</span>
                <span style={{ color: COLORS.accent2, fontWeight: 900, fontSize: 16 }}>¥{customTotal.toLocaleString()}</span>
              </div>
              {tN > 0 && (
                <div style={{ color: customTotal === tN ? COLORS.accent3 : "#ff6b6b", fontSize: 12, textAlign: "center", fontWeight: 700 }}>
                  {customTotal === tN ? "✅ 合計金額と一致！" : `差額: ¥${(tN - customTotal).toLocaleString()}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 詳細画面 ────────────────────────────────
function DetailView({ event, onBack, onAnswerUpdate, onAddTheirMember, onConfirmDate, onRevertDate, onUpdateDates, onDeleteEvent, onUpdateAttendance }) {
  const [activeTab, setActiveTab] = useState("schedule");
  const [showDelete, setShowDelete] = useState(false);
  const cfg = STATUS_CONFIG[event.status];

  return (
    <div>
      <div style={{
        padding: "16px 16px 12px", borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.surface, position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={onBack} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, color: COLORS.text, fontSize: 13, fontWeight: 700,
            cursor: "pointer", padding: "7px 14px",
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
          }}>← 一覧に戻る</button>
          <button onClick={() => setShowDelete(true)} style={{
            background: "none", border: "none", color: COLORS.muted,
            fontSize: 20, cursor: "pointer", padding: "4px",
          }}>🗑️</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{event.title}</div>
            <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
              {[...event.myGroup, ...event.theirGroup].length}名参加 · 回答率 {getResponseRate(event)}%
            </div>
          </div>
          <Badge color={cfg.color}>{cfg.icon} {event.status}</Badge>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "10px 12px", background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, overflowX: "auto" }}>
        <Tab label="📅 日程調整" active={activeTab === "schedule"} onClick={() => setActiveTab("schedule")} />
        <Tab label="👥 メンバー" active={activeTab === "members"} onClick={() => setActiveTab("members")} />
        {(event.status === "日程確定" || event.status === "完了") && (
          <Tab label="✅ 出欠" active={activeTab === "attendance"} onClick={() => setActiveTab("attendance")} />
        )}
        <Tab label="💰 割り勘" active={activeTab === "split"} onClick={() => setActiveTab("split")} />
      </div>
      <div style={{ padding: "18px 16px" }}>
        {activeTab === "schedule" && (
          <ScheduleView event={event} onAnswerUpdate={onAnswerUpdate} onConfirmDate={onConfirmDate} onRevertDate={onRevertDate} onUpdateDates={onUpdateDates} />
        )}
        {activeTab === "members" && <MembersView event={event} onAddTheirMember={m => onAddTheirMember(event.id, m)} />}
        {activeTab === "attendance" && <AttendanceView event={event} onUpdateAttendance={onUpdateAttendance} />}
        {activeTab === "split" && <SplitView event={event} />}
      </div>
      {showDelete && (
        <DeleteConfirmModal
          title={event.title}
          onConfirm={() => { onDeleteEvent(event.id); onBack(); }}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}


// ── カレンダービュー ────────────────────────
function CalendarView({ events, onSelect }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [innerTab, setInnerTab] = useState("calendar"); // "calendar" | "list"

  const confirmed = events.filter(e => e.status === "日程確定" && e.confirmedDate);
  const completed = events.filter(e => e.status === "完了" && e.confirmedDate);
  const allFixed = [...confirmed, ...completed];

  // 確定日 → dayKey → イベント配列
  const dayMap = {};
  allFixed.forEach(ev => {
    const m = ev.confirmedDate.match(/^(\d+)\/(\d+)/);
    if (!m) return;
    const key = `${viewYear}-${parseInt(m[1])}-${parseInt(m[2])}`;
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push(ev);
  });

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  const prevMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const WDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedKey = selectedDay ? `${viewYear}-${viewMonth + 1}-${selectedDay}` : null;
  const selectedEvents = selectedKey ? (dayMap[selectedKey] || []) : [];

  const innerTabStyle = (active) => ({
    flex: 1, padding: "8px 0", background: active ? COLORS.accent : "transparent",
    color: active ? "#fff" : COLORS.muted, border: "none", borderRadius: 8,
    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div>
      {/* 内部タブ */}
      <div style={{
        display: "flex", gap: 4, padding: "10px 16px",
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <button style={innerTabStyle(innerTab === "calendar")} onClick={() => setInnerTab("calendar")}>
          📅 カレンダー
        </button>
        <button style={innerTabStyle(innerTab === "list")} onClick={() => setInnerTab("list")}>
          ✅ 日程確定一覧
        </button>
      </div>

      {innerTab === "calendar" ? (
        <div style={{ padding: "16px" }}>
          {/* カレンダー本体 */}
          <div style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 16, padding: "16px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <button onClick={prevMonth} style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
                color: COLORS.muted, width: 36, height: 36, cursor: "pointer", fontSize: 18, fontFamily: "inherit",
              }}>‹</button>
              <div style={{ color: COLORS.text, fontWeight: 900, fontSize: 17 }}>
                {viewYear}年 {viewMonth + 1}月
              </div>
              <button onClick={nextMonth} style={{
                background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
                color: COLORS.muted, width: 36, height: 36, cursor: "pointer", fontSize: 18, fontFamily: "inherit",
              }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
              {WDAYS.map((w, i) => (
                <div key={w} style={{
                  textAlign: "center", fontSize: 11, fontWeight: 700, padding: "4px 0",
                  color: i === 0 ? "#ff6b6b" : i === 6 ? "#4da6ff" : COLORS.muted,
                }}>{w}</div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const key = `${viewYear}-${viewMonth + 1}-${d}`;
                const evs = dayMap[key] || [];
                const isToday = key === todayKey;
                const isSel = selectedDay === d;
                const dow = (firstDay + d - 1) % 7;
                const hasConfirmed = evs.some(e => e.status === "日程確定");
                const hasCompleted = evs.some(e => e.status === "完了");
                const dotColor = hasConfirmed ? COLORS.accent3 : hasCompleted ? COLORS.muted : null;

                return (
                  <button key={d}
                    onClick={() => setSelectedDay(isSel ? null : d)}
                    style={{
                      aspectRatio: "1", borderRadius: 10, border: "none", cursor: "pointer",
                      fontWeight: isToday || evs.length > 0 ? 800 : 500,
                      fontSize: 13, fontFamily: "inherit",
                      background: isSel
                        ? (evs.length > 0 ? COLORS.accent3 + "44" : COLORS.accent2 + "33")
                        : isToday ? COLORS.accent + "22" : "transparent",
                      outline: isSel ? `2px solid ${evs.length > 0 ? COLORS.accent3 : COLORS.accent2}88` : "none",
                      color: isToday && !isSel ? COLORS.accent : dow === 0 ? "#ff6b6b" : dow === 6 ? "#4da6ff" : COLORS.text,
                      display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2, padding: "2px 0",
                    }}
                  >
                    {d}
                    {dotColor && <div style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 選択日の表示 */}
          {selectedDay && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: COLORS.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
                {viewMonth + 1}/{selectedDay}
              </div>
              {selectedEvents.length === 0 ? (
                <div style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 12, padding: "16px", textAlign: "center", color: COLORS.muted, fontSize: 13,
                }}>この日の予定はありません</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {selectedEvents.map(ev => {
                    const cfg = STATUS_CONFIG[ev.status];
                    return (
                      <div key={ev.id} onClick={() => onSelect(ev)} style={{
                        background: COLORS.card, borderLeft: `3px solid ${cfg.color}`,
                        border: `1px solid ${cfg.color}44`,
                        borderRadius: 12, padding: "14px 16px", cursor: "pointer",
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, marginBottom: 4 }}>{ev.title}</div>
                        <div style={{ color: cfg.color, fontSize: 12, fontWeight: 700 }}>
                          {cfg.icon} {ev.confirmedDate}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ height: 120 }} />
        </div>
      ) : (
        /* 日程確定一覧タブ */
        <div style={{ padding: "16px" }}>
          {confirmed.length === 0 ? (
            <div style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 12, padding: "32px 20px", textAlign: "center", color: COLORS.muted, fontSize: 13,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              日程確定中の合コンはありません
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {[...confirmed].sort((a, b) => {
                const ma = a.confirmedDate.match(/^(\d+)\/(\d+)/);
                const mb = b.confirmedDate.match(/^(\d+)\/(\d+)/);
                if (!ma || !mb) return 0;
                return parseInt(ma[1]) * 100 + parseInt(ma[2]) - (parseInt(mb[1]) * 100 + parseInt(mb[2]));
              }).map(ev => {
                const cfg = STATUS_CONFIG[ev.status];
                const allM = [...ev.myGroup, ...ev.theirGroup];
                return (
                  <div key={ev.id} onClick={() => onSelect(ev)} style={{
                    background: COLORS.card, border: `1px solid ${COLORS.border}`,
                    borderLeft: `3px solid ${cfg.color}`,
                    borderRadius: 16, padding: "16px", cursor: "pointer",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>{ev.title}</div>
                      <Badge color={cfg.color}>{cfg.icon} {ev.status}</Badge>
                    </div>
                    <div style={{
                      background: cfg.color + "18", border: `1px solid ${cfg.color}33`,
                      borderRadius: 10, padding: "8px 12px", marginBottom: 10,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span>📅</span>
                      <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>{ev.confirmedDate}</span>
                    </div>
                    <div style={{ color: COLORS.muted, fontSize: 11 }}>{ev.myGroup.length}名</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ height: 120 }} />
        </div>
      )}
    </div>
  );
}


// ── グループ管理画面 ─────────────────────────
function GroupsView({ groups, onCreateGroup, onDeleteGroup, onUpdateGroup }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "grid", gap: 12 }}>
        {groups.map(g => (
          <div key={g.id} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 16, padding: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text }}>{g.name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditTarget(g)} style={{
                  background: COLORS.surface, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.muted, fontSize: 12, fontWeight: 700,
                  padding: "5px 10px", cursor: "pointer", fontFamily: "inherit",
                }}>✏️ 編集</button>
                <button onClick={() => setDeleteTarget(g)} style={{
                  background: "none", border: "none", color: COLORS.muted,
                  fontSize: 16, cursor: "pointer", padding: "4px",
                }}>🗑️</button>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {g.members.map(m => (
                <span key={m.id} style={{
                  background: COLORS.accent + "18", border: `1px solid ${COLORS.accent}33`,
                  borderRadius: 20, padding: "4px 12px", color: COLORS.text, fontSize: 13, fontWeight: 600,
                }}>{m.name}</span>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setShowCreate(true)} style={{
          padding: "16px", borderRadius: 16, background: "transparent",
          border: `1.5px dashed ${COLORS.border}`, color: COLORS.muted,
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>＋ 新しいグループを作成</button>
      </div>
      {showCreate && (
        <GroupEditModal
          onSave={g => { onCreateGroup(g); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <GroupEditModal
          existing={editTarget}
          onSave={g => { onUpdateGroup(g); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.name}
          onConfirm={() => { onDeleteGroup(deleteTarget.id); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      <div style={{ height: 120 }} />
    </div>
  );
}

// ── ホーム一覧 ───────────────────────────────
function HomeView({ events, groups, onSelect, onCreateEvent, onDeleteEvent }) {
  const [filter, setFilter] = useState("すべて");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const filters = ["すべて", "調整中", "日程確定", "完了"];
  const STATUS_ORDER = { "調整中": 0, "日程確定": 1, "完了": 2 };
  const filtered = (filter === "すべて" ? events.filter(e => e.status !== "完了") : events.filter(e => e.status === filter))
    .slice()
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "16px 16px 0" }}>
        {[
          { label: "調整中", value: events.filter(e => e.status === "調整中").length, color: COLORS.accent2 },
          { label: "日程確定", value: events.filter(e => e.status === "日程確定").length, color: COLORS.accent3 },
          { label: "完了", value: events.filter(e => e.status === "完了").length, color: COLORS.muted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: COLORS.card, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: "12px", textAlign: "center",
          }}>
            <div style={{ color, fontSize: 24, fontWeight: 900 }}>{value}</div>
            <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "14px 16px 10px", overflowX: "auto" }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            whiteSpace: "nowrap",
            background: filter === f ? COLORS.accent : COLORS.card,
            color: filter === f ? "#fff" : COLORS.muted,
            border: `1px solid ${filter === f ? COLORS.accent : COLORS.border}`,
            borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>{STATUS_CONFIG[f]?.icon || "🗂️"} {f}</button>
        ))}
      </div>

      <div style={{ padding: "0 16px", display: "grid", gap: 12 }}>
        {filtered.map(event => {
          const cfg = STATUS_CONFIG[event.status];
          const rr = getResponseRate(event);
          const allM = [...event.myGroup, ...event.theirGroup];
          const scores = event.dates.map(d => countScore(d.answers));
          const maxS = scores.length > 0 ? Math.max(...scores) : 0;
          const bestI = scores.indexOf(maxS);

          return (
            <div key={event.id} onClick={() => onSelect(event)} style={{
              background: COLORS.card, border: `1px solid ${COLORS.border}`,
              borderRadius: 16, padding: "16px", cursor: "pointer",
              borderLeft: `3px solid ${cfg.color}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ flex: 1 }} onClick={e => { e.stopPropagation(); onSelect(event); }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>{event.title}</div>
                  <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>作成日 {event.createdAt}　{event.myGroup.length}名</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge color={cfg.color}>{cfg.icon} {event.status}</Badge>
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(event); }} style={{
                    background: "none", border: "none", color: COLORS.muted,
                    fontSize: 16, cursor: "pointer", padding: "4px", lineHeight: 1,
                  }}>🗑️</button>
                </div>
              </div>

              {event.confirmedDate ? (
                <div style={{
                  background: cfg.color + "15", border: `1px solid ${cfg.color}33`,
                  borderRadius: 10, padding: "8px 12px", marginBottom: 10,
                }}>
                  <span>📅 </span><span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>{event.confirmedDate}</span>
                </div>
              ) : event.dates.length > 0 && maxS > 0 ? (
                <div style={{
                  background: COLORS.accent2 + "12", border: `1px solid ${COLORS.accent2}30`,
                  borderRadius: 10, padding: "8px 12px", marginBottom: 10,
                }}>
                  <span>💡 </span><span style={{ color: COLORS.accent2, fontSize: 12, fontWeight: 600 }}>最有力：{event.dates[bestI]?.label}</span>
                </div>
              ) : null}
              {(() => {
                if (event.status !== "調整中") return null;
                const unanswered = allM.filter(m =>
                  event.dates.some(d => !d.answers[m.id] || d.answers[m.id] === "")
                );
                return (
                  <div>
                    {unanswered.length === 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13 }}>✅</span>
                        <span style={{ color: COLORS.accent3, fontSize: 12, fontWeight: 700 }}>全員回答済み</span>
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: COLORS.muted, fontSize: 10, fontWeight: 700, marginBottom: 5 }}>
                          未回答 {unanswered.length}名
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {unanswered.map(m => (
                            <span key={m.id} style={{
                              background: COLORS.accent + "18",
                              border: `1px solid ${COLORS.accent}44`,
                              borderRadius: 20, padding: "3px 10px",
                              color: COLORS.accent, fontSize: 11, fontWeight: 700,
                            }}>{m.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <div style={{ position: "fixed", bottom: 82, right: 20 }}>
        <button onClick={() => setShowCreate(true)} style={{
          width: 56, height: 56, borderRadius: 16, background: COLORS.accent,
          border: "none", color: "#fff", fontSize: 26, cursor: "pointer",
          boxShadow: `0 8px 24px ${COLORS.accent}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>＋</button>
      </div>

      {showCreate && (
        <CreateEventModal
          groups={groups}
          onSave={e => { onCreateEvent(e); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.title}
          onConfirm={() => { onDeleteEvent(deleteTarget.id); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      <div style={{ height: 120 }} />
    </div>
  );
}

// ── ルート ───────────────────────────────────
export default function App() {
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(true);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // Firestoreからリアルタイムでデータ取得
  useEffect(() => {
    const unsubEvents = onSnapshot(collection(db, "events"), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setEvents(applyAutoComplete(data));
      setLoading(false);
    });
    const unsubGroups = onSnapshot(collection(db, "groups"), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      setGroups(data);
    });
    return () => { unsubEvents(); unsubGroups(); };
  }, []);

  // 1分ごとに自動完了チェック＆Firestore更新
  useEffect(() => {
    const timer = setInterval(async () => {
      const updated = applyAutoComplete(events);
      for (const ev of updated) {
        const orig = events.find(e => e.id === ev.id);
        if (orig && orig.status !== ev.status) {
          await updateDoc(doc(db, "events", String(ev.id)), { status: ev.status });
        }
      }
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [events]);

  const handleAnswerUpdate = async (eventId, memberId, answers) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const newDates = ev.dates.map(d => ({ ...d, answers: { ...d.answers, [memberId]: answers[d.id] } }));
    await updateDoc(doc(db, "events", String(eventId)), { dates: newDates });
  };

  const handleAddTheirMember = async (eventId, member) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const newTheirGroup = [...ev.theirGroup, member];
    const newDates = ev.dates.map(d => ({ ...d, answers: { ...d.answers, [member.id]: "" } }));
    await updateDoc(doc(db, "events", String(eventId)), { theirGroup: newTheirGroup, dates: newDates });
  };

  const handleConfirmDate = async (eventId, dateLabel) => {
    await updateDoc(doc(db, "events", String(eventId)), { status: "日程確定", confirmedDate: dateLabel });
  };

  const handleUpdateDates = async (eventId, newDates) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const newStatus = ev.status === "日程確定" ? "調整中" : ev.status;
    const newConfirmed = ev.status === "日程確定" ? null : ev.confirmedDate;
    await updateDoc(doc(db, "events", String(eventId)), { dates: newDates, status: newStatus, confirmedDate: newConfirmed });
  };

  const handleDeleteEvent = async (eventId) => {
    await deleteDoc(doc(db, "events", String(eventId)));
  };

  const handleDeleteGroup = async (groupId) => {
    await deleteDoc(doc(db, "groups", String(groupId)));
  };

  const handleUpdateGroup = async (group) => {
    await setDoc(doc(db, "groups", String(group.id)), group);
  };

  const handleUpdateAttendance = async (eventId, memberId, status) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    const newAttendance = { ...(ev.attendance || {}), [memberId]: status };
    await updateDoc(doc(db, "events", String(eventId)), { attendance: newAttendance });
  };

  const handleRevertDate = async (eventId) => {
    await updateDoc(doc(db, "events", String(eventId)), { status: "調整中", confirmedDate: null });
  };

  const navBtnStyle = (active) => ({
    flex: 1, padding: "10px 0", background: "none", border: "none",
    color: active ? COLORS.accent : COLORS.muted,
    fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
    borderTop: `2px solid ${active ? COLORS.accent : "transparent"}`,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  });

  const [appTitle, setAppTitle] = useState("Gocal");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", gap: 16,
    }}>
      <div style={{ fontSize: 40 }}>🎉</div>
      <div style={{ color: COLORS.muted, fontSize: 14, fontWeight: 700 }}>Gocal を読み込み中...</div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif",
      maxWidth: "100%", margin: "0 auto", paddingBottom: 100,
    }}>
      {/* ヘッダー */}
      {!selectedEvent && (
        <div style={{
          padding: "24px 16px 14px", borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.surface, position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ fontSize: 11, color: COLORS.muted, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>GOCAL</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {page === "home" && !editingTitle ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{appTitle}</div>
                <button onClick={() => { setTitleDraft(appTitle); setEditingTitle(true); }} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, color: COLORS.muted, fontSize: 11,
                  padding: "4px 8px", cursor: "pointer", fontFamily: "inherit",
                }}>✏️</button>
              </div>
            ) : page === "home" && editingTitle ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginRight: 12 }}>
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && titleDraft.trim()) { setAppTitle(titleDraft.trim()); setEditingTitle(false); }
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  style={{
                    flex: 1, background: COLORS.card, border: `1px solid ${COLORS.accent}`,
                    borderRadius: 10, padding: "6px 12px", color: COLORS.text,
                    fontSize: 18, fontWeight: 900, fontFamily: "inherit", outline: "none",
                  }}
                />
                <button onClick={() => { if (titleDraft.trim()) { setAppTitle(titleDraft.trim()); } setEditingTitle(false); }} style={{
                  background: COLORS.accent, border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
                }}>保存</button>
              </div>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                {page === "calendar" ? "カレンダー" : "グループ管理"}
              </div>
            )}
            {!editingTitle && (
              <div style={{ color: COLORS.muted, fontSize: 12 }}>
                {page === "home" ? `全${events.length}件` : page === "calendar" ? `${new Date().getMonth()+1}月` : `${groups.length}グループ`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* コンテンツ */}
      {selectedEvent ? (
        <DetailView
          event={selectedEvent}
          onBack={() => setSelectedEventId(null)}
          onAnswerUpdate={handleAnswerUpdate}
          onAddTheirMember={handleAddTheirMember}
          onConfirmDate={handleConfirmDate}
          onRevertDate={handleRevertDate}
          onUpdateDates={handleUpdateDates}
          onDeleteEvent={handleDeleteEvent}
          onUpdateAttendance={handleUpdateAttendance}
        />
      ) : page === "home" ? (
        <HomeView
          events={events}
          groups={groups}
          onSelect={e => setSelectedEventId(e.id)}
          onCreateEvent={async e => {
            await setDoc(doc(db, "events", String(e.id)), e);
          }}
          onDeleteEvent={handleDeleteEvent}
        />
      ) : page === "calendar" ? (
        <CalendarView
          events={events}
          onSelect={e => setSelectedEventId(e.id)}
        />
      ) : (
        <GroupsView
          groups={groups}
          onCreateGroup={async g => {
            await setDoc(doc(db, "groups", String(g.id)), g);
          }}
          onDeleteGroup={handleDeleteGroup}
          onUpdateGroup={handleUpdateGroup}
        />
      )}

      {/* ボトムナビ */}
      {!selectedEvent && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: "100%", background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`, display: "flex", zIndex: 20,
        }}>
          <button style={navBtnStyle(page === "home")} onClick={() => setPage("home")}>
            <span style={{ fontSize: 20 }}>🎉</span>合コン
          </button>
          <button style={navBtnStyle(page === "calendar")} onClick={() => setPage("calendar")}>
            <span style={{ fontSize: 20 }}>📅</span>カレンダー
          </button>
          <button style={navBtnStyle(page === "groups")} onClick={() => setPage("groups")}>
            <span style={{ fontSize: 20 }}>👥</span>グループ
          </button>
        </div>
      )}
    </div>
  );
}