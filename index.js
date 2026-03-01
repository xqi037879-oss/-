// ============================================
// 🌙 Life Companion / 生活伴侣
// SillyTavern Extension
// Features: Mood, Diary, Reminders, Life Events,
//           Food Log, Study (Vocab + Pomodoro + Quiz)
// ============================================

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = "life-companion";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// ============================================
// DATA STORAGE
// ============================================
const STORAGE_KEY = "life_companion_data";

const defaultData = {
  // Mood
  moods: [], // { date, mood, emoji, note }
  currentMood: null,

  // Diary
  diaryEntries: [], // { id, date, text, injectToChat }
  diaryInjectEnabled: true,

  // Reminders
  reminders: [
    { id: 1, time: "23:00", label: "该睡觉啦！早睡早起身体好～", enabled: true, type: "sleep" },
    { id: 2, time: "12:00", label: "中午了，记得吃午饭哦！", enabled: true, type: "meal" },
    { id: 3, time: "08:00", label: "早上好！新的一天开始了～", enabled: true, type: "morning" },
  ],
  lastReminderCheck: null,

  // Life Events
  lifeEventsEnabled: true,
  lifeEventFrequency: 5, // every N messages
  lifeEventCounter: 0,
  lifeEventLog: [],

  // Food Log
  foodLog: [], // { id, date, mealType, items, time, note }

  // Study - Vocab
  vocabList: [],
  vocabProgress: {}, // { word: { correct, wrong, lastReview } }

  // Study - Pomodoro
  pomodoroWorkMin: 25,
  pomodoroBreakMin: 5,
  pomodoroCompleted: 0,
  pomodoroTodayDate: null,
  pomodoroTodayCount: 0,

  // Study - Quiz
  quizHistory: [], // { date, total, correct }

  // Settings
  settings: {
    moodInjectEnabled: true,
    diaryInjectEnabled: true,
    lifeEventsEnabled: true,
    remindersEnabled: true,
    reminderViaChatEnabled: true,
    floatButtonVisible: true,
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getData() {
  if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
  }
  if (!extension_settings[extensionName].data) {
    extension_settings[extensionName].data = JSON.parse(JSON.stringify(defaultData));
  }
  return extension_settings[extensionName].data;
}

function saveData() {
  saveSettingsDebounced();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(date) {
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayStr() {
  return formatDate(new Date());
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "lc-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================
// MOOD DEFINITIONS
// ============================================
const MOODS = [
  { key: "happy", emoji: "😊", label: "开心", en: "happy" },
  { key: "excited", emoji: "🤩", label: "兴奋", en: "excited" },
  { key: "calm", emoji: "😌", label: "平静", en: "calm" },
  { key: "tired", emoji: "😴", label: "疲惫", en: "tired" },
  { key: "anxious", emoji: "😰", label: "焦虑", en: "anxious" },
  { key: "sad", emoji: "😢", label: "难过", en: "sad" },
  { key: "angry", emoji: "😤", label: "生气", en: "angry" },
  { key: "love", emoji: "🥰", label: "恋爱", en: "in love" },
];

// ============================================
// LIFE EVENTS POOL
// ============================================
const LIFE_EVENTS = {
  weather: [
    "外面突然下起了小雨，空气中弥漫着泥土的清香。",
    "今天阳光特别好，适合出去走走。",
    "窗外刮起了大风，树叶沙沙作响。",
    "天空中出现了一道彩虹！好漂亮！",
    "今天雾蒙蒙的，像是走在云里一样。",
    "外面飘起了雪花，世界变得安静了。",
    "今天的夕阳特别美，整个天空都是橙红色。",
    "突然打了一个响雷，吓了一跳！",
  ],
  daily: [
    "你发现桌上多了一杯还冒着热气的咖啡。",
    "隔壁传来好闻的饭菜香味。",
    "你的手机收到了一条老朋友的消息。",
    "你在口袋里发现了上次忘记的零钱。",
    "楼下的猫咪在窗台上晒太阳，看起来好惬意。",
    "你最喜欢的歌突然在耳边响起。",
    "快递到了！是之前下单的东西。",
    "你发现冰箱里还有昨天剩的蛋糕。",
    "窗台上的小花今天开了。",
    "邻居家的小狗朝你摇了摇尾巴。",
  ],
  thoughts: [
    "突然想到了一个有趣的点子，得赶紧记下来。",
    "回想起了一段美好的回忆，嘴角不自觉上扬。",
    "突然很想吃火锅…",
    "脑海里浮现出了一首很久没听的歌。",
    "想起了一个好久没联系的朋友，要不要给TA发个消息？",
    "突然感觉很感恩现在拥有的一切。",
    "灵光一闪，想到了一个解决问题的好办法。",
    "突然很想去旅行，哪里都好。",
  ],
  body: [
    "伸了一个大懒腰，感觉浑身舒畅。",
    "肚子咕咕叫了，该吃东西了。",
    "打了一个大哈欠，有点困了。",
    "喝了一口温水，感觉整个人都暖了。",
    "揉了揉有点酸的眼睛，要注意用眼休息啊。",
    "站起来活动了一下筋骨，感觉好多了。",
  ],
  social: [
    "收到了一条温暖的消息，心情变好了。",
    "朋友分享了一张有趣的照片给你。",
    "有人给你点了个赞，小小的认可也很开心。",
    "听到了一个朋友的好消息，替TA高兴。",
    "和同事聊了几句，发现了共同的爱好。",
  ]
};

// ============================================
// DEFAULT VOCAB LIST (CET-4 / Common Words)
// ============================================
const DEFAULT_VOCAB = [
  { word: "abandon", phonetic: "/əˈbændən/", meaning: "v. 放弃，抛弃" },
  { word: "absorb", phonetic: "/əbˈzɔːrb/", meaning: "v. 吸收；使全神贯注" },
  { word: "abstract", phonetic: "/ˈæbstrækt/", meaning: "adj. 抽象的 n. 摘要" },
  { word: "abundant", phonetic: "/əˈbʌndənt/", meaning: "adj. 丰富的，充裕的" },
  { word: "accelerate", phonetic: "/əkˈseləreɪt/", meaning: "v. 加速" },
  { word: "accommodate", phonetic: "/əˈkɒmədeɪt/", meaning: "v. 容纳；适应" },
  { word: "accomplish", phonetic: "/əˈkɒmplɪʃ/", meaning: "v. 完成，实现" },
  { word: "accumulate", phonetic: "/əˈkjuːmjəleɪt/", meaning: "v. 积累" },
  { word: "accurate", phonetic: "/ˈækjərət/", meaning: "adj. 精确的" },
  { word: "acknowledge", phonetic: "/əkˈnɒlɪdʒ/", meaning: "v. 承认；感谢" },
  { word: "acquire", phonetic: "/əˈkwaɪər/", meaning: "v. 获得，取得" },
  { word: "adequate", phonetic: "/ˈædɪkwət/", meaning: "adj. 足够的；适当的" },
  { word: "administration", phonetic: "/ədˌmɪnɪˈstreɪʃən/", meaning: "n. 管理；行政" },
  { word: "adolescent", phonetic: "/ˌædəˈlesənt/", meaning: "n. 青少年 adj. 青春期的" },
  { word: "affection", phonetic: "/əˈfekʃən/", meaning: "n. 喜爱；感情" },
  { word: "aggressive", phonetic: "/əˈɡresɪv/", meaning: "adj. 好斗的；积极进取的" },
  { word: "allocate", phonetic: "/ˈæləkeɪt/", meaning: "v. 分配" },
  { word: "ambiguous", phonetic: "/æmˈbɪɡjuəs/", meaning: "adj. 模糊不清的" },
  { word: "ambitious", phonetic: "/æmˈbɪʃəs/", meaning: "adj. 有雄心的" },
  { word: "anonymous", phonetic: "/əˈnɒnɪməs/", meaning: "adj. 匿名的" },
  { word: "anticipate", phonetic: "/ænˈtɪsɪpeɪt/", meaning: "v. 预期；期望" },
  { word: "apparent", phonetic: "/əˈpærənt/", meaning: "adj. 明显的；表面上的" },
  { word: "appetite", phonetic: "/ˈæpɪtaɪt/", meaning: "n. 食欲；欲望" },
  { word: "appreciate", phonetic: "/əˈpriːʃieɪt/", meaning: "v. 欣赏；感激" },
  { word: "approach", phonetic: "/əˈprəʊtʃ/", meaning: "v. 接近 n. 方法" },
  { word: "appropriate", phonetic: "/əˈprəʊpriət/", meaning: "adj. 适当的" },
  { word: "approve", phonetic: "/əˈpruːv/", meaning: "v. 批准；赞成" },
  { word: "arise", phonetic: "/əˈraɪz/", meaning: "v. 出现；产生" },
  { word: "artificial", phonetic: "/ˌɑːtɪˈfɪʃəl/", meaning: "adj. 人工的；不自然的" },
  { word: "assess", phonetic: "/əˈses/", meaning: "v. 评估" },
  { word: "assignment", phonetic: "/əˈsaɪnmənt/", meaning: "n. 任务；作业" },
  { word: "assume", phonetic: "/əˈsjuːm/", meaning: "v. 假设；承担" },
  { word: "assure", phonetic: "/əˈʃʊər/", meaning: "v. 保证；使确信" },
  { word: "atmosphere", phonetic: "/ˈætməsfɪər/", meaning: "n. 大气层；气氛" },
  { word: "attribute", phonetic: "/əˈtrɪbjuːt/", meaning: "v. 归因于 n. 属性" },
  { word: "authentic", phonetic: "/ɔːˈθentɪk/", meaning: "adj. 真正的；可靠的" },
  { word: "authority", phonetic: "/ɔːˈθɒrəti/", meaning: "n. 权威；当局" },
  { word: "available", phonetic: "/əˈveɪləbl/", meaning: "adj. 可用的；有空的" },
  { word: "awareness", phonetic: "/əˈweənəs/", meaning: "n. 意识；认识" },
  { word: "barrier", phonetic: "/ˈbæriər/", meaning: "n. 障碍；屏障" },
  { word: "beneficial", phonetic: "/ˌbenɪˈfɪʃəl/", meaning: "adj. 有益的" },
  { word: "boundary", phonetic: "/ˈbaʊndəri/", meaning: "n. 边界" },
  { word: "breakthrough", phonetic: "/ˈbreɪkθruː/", meaning: "n. 突破" },
  { word: "bureaucracy", phonetic: "/bjʊˈrɒkrəsi/", meaning: "n. 官僚主义" },
  { word: "capability", phonetic: "/ˌkeɪpəˈbɪləti/", meaning: "n. 能力；性能" },
  { word: "catastrophe", phonetic: "/kəˈtæstrəfi/", meaning: "n. 灾难" },
  { word: "challenge", phonetic: "/ˈtʃælɪndʒ/", meaning: "n. 挑战 v. 挑战" },
  { word: "circumstance", phonetic: "/ˈsɜːkəmstəns/", meaning: "n. 环境；情况" },
  { word: "collapse", phonetic: "/kəˈlæps/", meaning: "v. 倒塌；崩溃" },
  { word: "compensate", phonetic: "/ˈkɒmpenseɪt/", meaning: "v. 补偿" },
];


// ============================================
// CORE: PANEL HTML BUILDER
// ============================================
function buildPanelHTML() {
  const data = getData();
  return `
  <div id="life-companion-panel">
    <div class="lc-panel-header">
      <h2>🌙 生活伴侣</h2>
      <button class="lc-close-btn" id="lc-close-panel">✕</button>
    </div>

    <div class="lc-tabs">
      <button class="lc-tab-btn active" data-tab="mood">😊 心情</button>
      <button class="lc-tab-btn" data-tab="diary">📝 日记</button>
      <button class="lc-tab-btn" data-tab="reminders">⏰ 作息</button>
      <button class="lc-tab-btn" data-tab="events">🎲 事件</button>
      <button class="lc-tab-btn" data-tab="food">🍜 饮食</button>
      <button class="lc-tab-btn" data-tab="study">📚 学习</button>
      <button class="lc-tab-btn" data-tab="settings">⚙️ 设置</button>
    </div>

    <!-- ===== MOOD TAB ===== -->
    <div class="lc-tab-content active" id="lc-tab-mood">
      <div class="lc-card">
        <div class="lc-card-title">🎭 现在的心情</div>
        <div class="lc-mood-grid" id="lc-mood-grid"></div>
        <div class="lc-row">
          <input class="lc-input lc-flex-1" id="lc-mood-note" placeholder="心情备注（可选）..." />
          <button class="lc-btn lc-btn-primary" id="lc-mood-save">记录</button>
        </div>
      </div>
      <div class="lc-card">
        <div class="lc-card-title">📊 心情历史</div>
        <div class="lc-mood-history" id="lc-mood-history"></div>
      </div>
    </div>

    <!-- ===== DIARY TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-diary">
      <div class="lc-card">
        <div class="lc-card-title">✏️ 写点什么</div>
        <textarea class="lc-textarea" id="lc-diary-input" placeholder="今天发生了什么有趣的事？"></textarea>
        <div class="lc-row" style="margin-top:8px;">
          <label style="font-size:12px; color:var(--SmartThemeBodyColor,#aaa); display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="lc-diary-inject-check" ${data.settings.diaryInjectEnabled ? "checked" : ""} />
            注入聊天上下文
          </label>
          <div style="flex:1;"></div>
          <button class="lc-btn lc-btn-primary" id="lc-diary-save">保存日记</button>
        </div>
      </div>
      <div class="lc-card">
        <div class="lc-card-title">📖 日记本</div>
        <div class="lc-diary-list" id="lc-diary-list"></div>
      </div>
    </div>

    <!-- ===== REMINDERS TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-reminders">
      <div class="lc-card">
        <div class="lc-card-title">⏰ 作息提醒</div>
        <div id="lc-reminder-list"></div>
        <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
          <div class="lc-card-title">➕ 添加提醒</div>
          <div class="lc-row">
            <input class="lc-input" id="lc-reminder-time" type="time" style="width:120px;" />
            <input class="lc-input lc-flex-1" id="lc-reminder-label" placeholder="提醒内容..." />
          </div>
          <button class="lc-btn lc-btn-primary lc-btn-block" id="lc-reminder-add" style="margin-top:6px;">添加</button>
        </div>
      </div>
    </div>

    <!-- ===== LIFE EVENTS TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-events">
      <div class="lc-card">
        <div class="lc-card-title">🎲 随机生活事件</div>
        <p style="font-size:12px; color:var(--SmartThemeBodyColor,#888); margin-bottom:8px;">
          每隔几条消息，会随机插入一个生活小事件到对话中，增加沉浸感。
        </p>
        <div class="lc-row">
          <span class="lc-label" style="margin:0;">频率：每</span>
          <input class="lc-input" id="lc-event-freq" type="number" min="1" max="50"
            value="${data.lifeEventFrequency}" style="width:60px;" />
          <span class="lc-label" style="margin:0;">条消息触发一次</span>
        </div>
        <button class="lc-btn lc-btn-secondary lc-btn-block" id="lc-event-preview-btn" style="margin-top:8px;">
          🎲 预览随机事件
        </button>
        <div id="lc-event-preview" style="margin-top:8px;"></div>
      </div>
      <div class="lc-card">
        <div class="lc-card-title">📜 最近触发的事件</div>
        <div class="lc-event-log" id="lc-event-log"></div>
      </div>
    </div>

    <!-- ===== FOOD TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-food">
      <div class="lc-card">
        <div class="lc-card-title">🍽️ 记录饮食</div>
        <div class="lc-row">
          <select class="lc-select" id="lc-food-meal" style="width:100px;">
            <option value="breakfast">🌅 早餐</option>
            <option value="lunch">☀️ 午餐</option>
            <option value="dinner">🌙 晚餐</option>
            <option value="snack">🍪 零食</option>
            <option value="drink">🥤 饮品</option>
          </select>
          <input class="lc-input lc-flex-1" id="lc-food-items" placeholder="吃了什么..." />
        </div>
        <textarea class="lc-textarea" id="lc-food-note" placeholder="备注（可选）..." style="min-height:40px; margin-top:6px;"></textarea>
        <button class="lc-btn lc-btn-primary lc-btn-block" id="lc-food-save" style="margin-top:6px;">记录</button>
      </div>
      <div class="lc-card">
        <div class="lc-card-title">📋 饮食记录</div>
        <div class="lc-food-log-list" id="lc-food-log"></div>
      </div>
    </div>

    <!-- ===== STUDY TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-study">
      <!-- Sub-tabs for study -->
      <div class="lc-tabs" style="margin: -16px -16px 12px -16px; border-top:1px solid var(--SmartThemeBorderColor,#333);">
        <button class="lc-tab-btn active" data-study-tab="pomodoro">🍅 番茄钟</button>
        <button class="lc-tab-btn" data-study-tab="vocab">📖 背单词</button>
        <button class="lc-tab-btn" data-study-tab="quiz">✏️ AI出题</button>
        <button class="lc-tab-btn" data-study-tab="vocab-manage">📚 词库</button>
      </div>

      <!-- Pomodoro -->
      <div class="lc-study-tab-content active" id="lc-study-pomodoro">
        <div class="lc-card">
          <div class="lc-pomodoro-display">
            <div class="lc-pomodoro-timer" id="lc-pomo-timer">25:00</div>
            <div class="lc-pomodoro-status" id="lc-pomo-status">准备开始专注</div>
          </div>
          <div class="lc-pomodoro-controls">
            <button class="lc-btn lc-btn-primary" id="lc-pomo-start">▶ 开始</button>
            <button class="lc-btn lc-btn-secondary" id="lc-pomo-pause" style="display:none;">⏸ 暂停</button>
            <button class="lc-btn lc-btn-danger lc-btn-sm" id="lc-pomo-reset">↺ 重置</button>
          </div>
          <div class="lc-row" style="margin-top:12px; justify-content:center;">
            <span class="lc-label" style="margin:0;">专注</span>
            <input class="lc-input" id="lc-pomo-work" type="number" min="1" max="90"
              value="${data.pomodoroWorkMin}" style="width:50px;text-align:center;" />
            <span class="lc-label" style="margin:0;">分钟 / 休息</span>
            <input class="lc-input" id="lc-pomo-break" type="number" min="1" max="30"
              value="${data.pomodoroBreakMin}" style="width:50px;text-align:center;" />
            <span class="lc-label" style="margin:0;">分钟</span>
          </div>
          <div class="lc-pomodoro-stats">
            <div class="lc-pomodoro-stat">
              <div class="lc-pomodoro-stat-num" id="lc-pomo-today">0</div>
              <div class="lc-pomodoro-stat-label">今日完成</div>
            </div>
            <div class="lc-pomodoro-stat">
              <div class="lc-pomodoro-stat-num" id="lc-pomo-total">${data.pomodoroCompleted}</div>
              <div class="lc-pomodoro-stat-label">累计完成</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Vocab -->
      <div class="lc-study-tab-content" id="lc-study-vocab">
        <div class="lc-card">
          <div class="lc-vocab-card-display" id="lc-vocab-card">
            <div class="lc-vocab-word" id="lc-vocab-word">点击开始</div>
            <div class="lc-vocab-phonetic" id="lc-vocab-phonetic"></div>
            <div class="lc-vocab-meaning" id="lc-vocab-meaning"></div>
          </div>
          <div class="lc-vocab-actions">
            <button class="lc-btn lc-btn-danger lc-btn-sm" id="lc-vocab-forgot">😵 不认识</button>
            <button class="lc-btn lc-btn-secondary lc-btn-sm" id="lc-vocab-show">👀 显示释义</button>
            <button class="lc-btn lc-btn-success lc-btn-sm" id="lc-vocab-know">✅ 认识</button>
          </div>
          <div style="text-align:center; margin-top:8px;">
            <button class="lc-btn lc-btn-primary lc-btn-sm" id="lc-vocab-next">下一个 →</button>
          </div>
        </div>
      </div>

      <!-- Quiz -->
      <div class="lc-study-tab-content" id="lc-study-quiz">
        <div class="lc-card">
          <div class="lc-card-title">✏️ AI 出题</div>
          <p style="font-size:12px; color:var(--SmartThemeBodyColor,#888); margin-bottom:10px;">
            根据你的词库随机出选择题。点击开始作答！
          </p>
          <div id="lc-quiz-area">
            <button class="lc-btn lc-btn-primary lc-btn-block" id="lc-quiz-start">开始答题（10题）</button>
          </div>
          <div id="lc-quiz-question" style="display:none;"></div>
          <div id="lc-quiz-score" style="margin-top:10px; text-align:center; font-size:14px; color:var(--SmartThemeBodyColor,#ccc);"></div>
        </div>
      </div>

      <!-- Vocab Management -->
      <div class="lc-study-tab-content" id="lc-study-vocab-manage">
        <div class="lc-card">
          <div class="lc-card-title">📚 词库管理</div>
          <div class="lc-row">
            <input class="lc-input" id="lc-vocab-add-word" placeholder="单词" style="width:100px;" />
            <input class="lc-input" id="lc-vocab-add-phonetic" placeholder="音标" style="width:100px;" />
            <input class="lc-input lc-flex-1" id="lc-vocab-add-meaning" placeholder="释义" />
          </div>
          <button class="lc-btn lc-btn-primary lc-btn-block" id="lc-vocab-add-btn" style="margin-top:6px;">添加单词</button>
          <div style="margin-top:8px;">
            <button class="lc-btn lc-btn-secondary lc-btn-sm" id="lc-vocab-load-default">载入默认词库（CET-4）</button>
            <span style="font-size:11px; color:var(--SmartThemeBodyColor,#888); margin-left:4px;">
              词库: <span id="lc-vocab-count">0</span> 词
            </span>
          </div>
          <div class="lc-vocab-list" id="lc-vocab-list-manage"></div>
        </div>
      </div>
    </div>

    <!-- ===== SETTINGS TAB ===== -->
    <div class="lc-tab-content" id="lc-tab-settings">
      <div class="lc-card">
        <div class="lc-card-title">⚙️ 插件设置</div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">心情注入到聊天</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-mood-inject"
            ${data.settings.moodInjectEnabled ? "checked" : ""} />
        </div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">日记注入到聊天</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-diary-inject"
            ${data.settings.diaryInjectEnabled ? "checked" : ""} />
        </div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">生活事件注入</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-events"
            ${data.settings.lifeEventsEnabled ? "checked" : ""} />
        </div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">作息提醒</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-reminders"
            ${data.settings.remindersEnabled ? "checked" : ""} />
        </div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">提醒通过角色消息发送</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-reminder-chat"
            ${data.settings.reminderViaChatEnabled ? "checked" : ""} />
        </div>

        <div class="lc-setting-row">
          <span class="lc-setting-label">显示浮动按钮</span>
          <input type="checkbox" class="lc-toggle" id="lc-set-float-btn"
            ${data.settings.floatButtonVisible ? "checked" : ""} />
        </div>
      </div>

      <div class="lc-card">
        <div class="lc-card-title">🗑️ 数据管理</div>
        <button class="lc-btn lc-btn-danger lc-btn-block" id="lc-clear-all-data">清除所有数据</button>
        <p style="font-size:11px; color:#e74c3c; margin-top:4px;">⚠️ 此操作不可撤销</p>
      </div>
    </div>
  </div>

  <!-- Floating Button -->
  <button id="lc-float-btn" title="生活伴侣">🌙</button>
  `;
}


// ============================================
// PANEL MANAGEMENT
// ============================================
let panelOpen = false;

function openPanel() {
  const panel = document.getElementById("life-companion-panel");
  if (panel) {
    panel.classList.add("open");
    panelOpen = true;
    refreshAllViews();
  }
}

function closePanel() {
  const panel = document.getElementById("life-companion-panel");
  if (panel) {
    panel.classList.remove("open");
    setTimeout(() => { panel.style.display = "none"; }, 300);
    panelOpen = false;
  }
}

function togglePanel() {
  if (panelOpen) closePanel();
  else openPanel();
}


// ============================================
// TAB SWITCHING
// ============================================
function initTabs() {
  // Main tabs
  document.querySelectorAll(".lc-tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lc-tab-btn[data-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".lc-tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const tab = document.getElementById(`lc-tab-${btn.dataset.tab}`);
      if (tab) tab.classList.add("active");
    });
  });

  // Study sub-tabs
  document.querySelectorAll(".lc-tab-btn[data-study-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".lc-tab-btn[data-study-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".lc-study-tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const tab = document.getElementById(`lc-study-${btn.dataset.studyTab}`);
      if (tab) tab.classList.add("active");
    });
  });
}


// ============================================
// MOOD MODULE
// ============================================
let selectedMood = null;

function renderMoodGrid() {
  const grid = document.getElementById("lc-mood-grid");
  if (!grid) return;
  grid.innerHTML = MOODS.map(m => `
    <div class="lc-mood-item ${selectedMood === m.key ? 'selected' : ''}" data-mood="${m.key}">
      <span class="lc-mood-emoji">${m.emoji}</span>
      <span class="lc-mood-label">${m.label}</span>
    </div>
  `).join("");

  grid.querySelectorAll(".lc-mood-item").forEach(item => {
    item.addEventListener("click", () => {
      selectedMood = item.dataset.mood;
      renderMoodGrid();
    });
  });
}

function renderMoodHistory() {
  const data = getData();
  const container = document.getElementById("lc-mood-history");
  if (!container) return;

  const recent = data.moods.slice(-20).reverse();
  if (recent.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--SmartThemeBodyColor,#666); text-align:center;">暂无记录</p>';
    return;
  }
  container.innerHTML = recent.map(entry => {
    const moodDef = MOODS.find(m => m.key === entry.mood);
    return `<div class="lc-mood-entry">
      <span>${moodDef ? moodDef.emoji : '❓'} ${moodDef ? moodDef.label : entry.mood}${entry.note ? ' - ' + entry.note : ''}</span>
      <span style="color:var(--SmartThemeBodyColor,#666);">${entry.date}</span>
    </div>`;
  }).join("");
}

function saveMood() {
  if (!selectedMood) {
    showToast("请先选择一个心情～");
    return;
  }
  const data = getData();
  const note = document.getElementById("lc-mood-note")?.value?.trim() || "";
  const moodDef = MOODS.find(m => m.key === selectedMood);

  data.moods.push({
    date: new Date().toLocaleString("zh-CN"),
    mood: selectedMood,
    emoji: moodDef?.emoji || "❓",
    note: note,
  });
  data.currentMood = selectedMood;
  saveData();

  const noteInput = document.getElementById("lc-mood-note");
  if (noteInput) noteInput.value = "";

  renderMoodHistory();
  showToast(`心情已记录：${moodDef?.emoji} ${moodDef?.label}`);
}

function getMoodPromptInjection() {
  const data = getData();
  if (!data.settings.moodInjectEnabled || !data.currentMood) return "";
  const moodDef = MOODS.find(m => m.key === data.currentMood);
  if (!moodDef) return "";
  return `[System: The user's current mood is "${moodDef.en}" (${moodDef.label} ${moodDef.emoji}). Please be aware of their emotional state and respond accordingly with appropriate empathy and tone.]`;
}


// ============================================
// DIARY MODULE
// ============================================
function renderDiaryList() {
  const data = getData();
  const container = document.getElementById("lc-diary-list");
  if (!container) return;

  const entries = data.diaryEntries.slice().reverse();
  if (entries.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--SmartThemeBodyColor,#666); text-align:center;">还没有日记～</p>';
    return;
  }

  container.innerHTML = entries.map(entry => `
    <div class="lc-diary-entry" data-id="${entry.id}">
      <div class="lc-diary-date">
        ${entry.date}
        ${entry.injectToChat
          ? '<span class="lc-diary-inject-badge lc-diary-inject-on">注入中</span>'
          : '<span class="lc-diary-inject-badge lc-diary-inject-off">未注入</span>'}
      </div>
      <div class="lc-diary-text">${escapeHtml(entry.text)}</div>
      <button class="lc-diary-delete" data-id="${entry.id}" title="删除">🗑️</button>
    </div>
  `).join("");

  container.querySelectorAll(".lc-diary-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      data.diaryEntries = data.diaryEntries.filter(e => e.id !== id);
      saveData();
      renderDiaryList();
      showToast("日记已删除");
    });
  });
}

function saveDiary() {
  const textarea = document.getElementById("lc-diary-input");
  const text = textarea?.value?.trim();
  if (!text) {
    showToast("写点什么再保存吧～");
    return;
  }

  const data = getData();
  const injectCheck = document.getElementById("lc-diary-inject-check");

  data.diaryEntries.push({
    id: generateId(),
    date: new Date().toLocaleString("zh-CN"),
    text: text,
    injectToChat: injectCheck?.checked ?? true,
  });
  saveData();

  textarea.value = "";
  renderDiaryList();
  showToast("日记已保存 ✨");
}

function getDiaryPromptInjection() {
  const data = getData();
  if (!data.settings.diaryInjectEnabled) return "";

  const injectEntries = data.diaryEntries.filter(e => e.injectToChat);
  if (injectEntries.length === 0) return "";

  // Only inject the last 3 entries to avoid context bloat
  const recent = injectEntries.slice(-3);
  const diaryText = recent.map(e => `[${e.date}] ${e.text}`).join("\n");
  return `[System: Here are the user's recent diary entries for context. Use this to understand their life situation:\n${diaryText}]`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ============================================
// REMINDERS MODULE
// ============================================
let reminderInterval = null;

function renderReminders() {
  const data = getData();
  const container = document.getElementById("lc-reminder-list");
  if (!container) return;

  container.innerHTML = data.reminders.map(r => `
    <div class="lc-reminder-item">
      <div class="lc-reminder-info">
        <div class="lc-reminder-time">${r.time}</div>
        <div class="lc-reminder-label-text">${r.label}</div>
      </div>
      <input type="checkbox" class="lc-toggle" data-reminder-id="${r.id}"
        ${r.enabled ? "checked" : ""} />
      <button class="lc-btn lc-btn-danger lc-btn-sm" data-del-reminder="${r.id}"
        style="margin-left:6px;">✕</button>
    </div>
  `).join("");

  container.querySelectorAll(".lc-toggle[data-reminder-id]").forEach(toggle => {
    toggle.addEventListener("change", () => {
      const id = parseInt(toggle.dataset.reminderId);
      const reminder = data.reminders.find(r => r.id === id);
      if (reminder) {
        reminder.enabled = toggle.checked;
        saveData();
      }
    });
  });

  container.querySelectorAll("[data-del-reminder]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.delReminder);
      data.reminders = data.reminders.filter(r => r.id !== id);
      saveData();
      renderReminders();
      showToast("提醒已删除");
    });
  });
}

function addReminder() {
  const timeInput = document.getElementById("lc-reminder-time");
  const labelInput = document.getElementById("lc-reminder-label");
  const time = timeInput?.value;
  const label = labelInput?.value?.trim();

  if (!time || !label) {
    showToast("请填写时间和内容～");
    return;
  }

  const data = getData();
  data.reminders.push({
    id: Date.now(),
    time: time,
    label: label,
    enabled: true,
    type: "custom"
  });
  saveData();

  timeInput.value = "";
  labelInput.value = "";
  renderReminders();
  showToast("提醒已添加");
}

function checkReminders() {
  const data = getData();
  if (!data.settings.remindersEnabled) return;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const checkKey = `${formatDate(now)}_${currentTime}`;

  if (data.lastReminderCheck === checkKey) return;

  for (const reminder of data.reminders) {
    if (!reminder.enabled) continue;
    if (reminder.time === currentTime) {
      data.lastReminderCheck = checkKey;
      saveData();

      // Show toast
      showToast(`⏰ ${reminder.label}`);

      // Optionally send as chat message
      if (data.settings.reminderViaChatEnabled) {
        try {
          const context = getContext();
          if (context && context.chat && context.chat.length > 0) {
            context.sendSystemMessage("generic",
              `[⏰ 作息提醒] ${reminder.label}\n(来自生活伴侣插件)`
            );
          }
        } catch (e) {
          console.log("[LifeCompanion] Could not send reminder to chat:", e);
        }
      }
      break; // Only one reminder per minute
    }
  }
}

function startReminderChecker() {
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(checkReminders, 30000); // Check every 30s
  checkReminders(); // Check immediately
}


// ============================================
// LIFE EVENTS MODULE
// ============================================
function getRandomEvent() {
  const categories = Object.keys(LIFE_EVENTS);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const events = LIFE_EVENTS[cat];
  const event = events[Math.floor(Math.random() * events.length)];
  return { category: cat, text: event };
}

function renderEventLog() {
  const data = getData();
  const container = document.getElementById("lc-event-log");
  if (!container) return;

  const recent = data.lifeEventLog.slice(-10).reverse();
  if (recent.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--SmartThemeBodyColor,#666); text-align:center;">暂无记录</p>';
    return;
  }
  container.innerHTML = recent.map(e => `
    <div class="lc-event-preview">
      <div class="lc-event-category">${e.category}</div>
      <div class="lc-event-text">${e.text}</div>
    </div>
  `).join("");
}

function previewEvent() {
  const event = getRandomEvent();
  const container = document.getElementById("lc-event-preview");
  if (container) {
    container.innerHTML = `
      <div class="lc-event-preview">
        <div class="lc-event-category">${event.category}</div>
        <div class="lc-event-text">${event.text}</div>
      </div>
    `;
  }
}

function tryInjectLifeEvent() {
  const data = getData();
  if (!data.settings.lifeEventsEnabled) return;

  data.lifeEventCounter = (data.lifeEventCounter || 0) + 1;
  if (data.lifeEventCounter < data.lifeEventFrequency) {
    saveData();
    return;
  }

  // Reset counter and inject
  data.lifeEventCounter = 0;
  const event = getRandomEvent();
  data.lifeEventLog.push({
    ...event,
    date: new Date().toLocaleString("zh-CN")
  });

  // Keep only last 50 events
  if (data.lifeEventLog.length > 50) {
    data.lifeEventLog = data.lifeEventLog.slice(-50);
  }
  saveData();

  try {
    const context = getContext();
    if (context) {
      context.sendSystemMessage("generic",
        `[🎲 生活小事件] ${event.text}`
      );
    }
  } catch (e) {
    console.log("[LifeCompanion] Could not inject life event:", e);
  }

  if (panelOpen) renderEventLog();
}


// ============================================
// FOOD LOG MODULE
// ============================================
const MEAL_LABELS = {
  breakfast: "🌅 早餐",
  lunch: "☀️ 午餐",
  dinner: "🌙 晚餐",
  snack: "🍪 零食",
  drink: "🥤 饮品",
};

function renderFoodLog() {
  const data = getData();
  const container = document.getElementById("lc-food-log");
  if (!container) return;

  if (data.foodLog.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:var(--SmartThemeBodyColor,#666); text-align:center;">暂无记录</p>';
    return;
  }

  // Group by date
  const grouped = {};
  data.foodLog.slice().reverse().forEach(entry => {
    const date = entry.date.split(" ")[0] || entry.date;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  });

  let html = "";
  for (const [date, entries] of Object.entries(grouped)) {
    html += `<div class="lc-food-day-header">${date}</div>`;
    entries.forEach(entry => {
      html += `
        <div class="lc-food-entry">
          <div class="lc-food-meal-type">${MEAL_LABELS[entry.mealType] || entry.mealType}</div>
          <div class="lc-food-items">${escapeHtml(entry.items)}</div>
          ${entry.note ? `<div class="lc-food-time">${escapeHtml(entry.note)}</div>` : ''}
          <div class="lc-food-time">${entry.time}</div>
        </div>
      `;
    });
  }
  container.innerHTML = html;
}

function saveFood() {
  const mealType = document.getElementById("lc-food-meal")?.value;
  const items = document.getElementById("lc-food-items")?.value?.trim();
  const note = document.getElementById("lc-food-note")?.value?.trim();

  if (!items) {
    showToast("请填写吃了什么～");
    return;
  }

  const data = getData();
  data.foodLog.push({
    id: generateId(),
    date: new Date().toLocaleString("zh-CN"),
    mealType: mealType,
    items: items,
    time: formatTime(new Date()),
    note: note || "",
  });

  // Keep max 500 entries
  if (data.foodLog.length > 500) data.foodLog = data.foodLog.slice(-500);
  saveData();

  document.getElementById("lc-food-items").value = "";
  document.getElementById("lc-food-note").value = "";
  renderFoodLog();
  showToast("饮食已记录 🍽️");
}


// ============================================
// STUDY - POMODORO MODULE
// ============================================
let pomodoroTimer = null;
let pomodoroSeconds = 0;
let pomodoroIsWork = true;
let pomodoroRunning = false;

function updatePomodoroDisplay() {
  const timerEl = document.getElementById("lc-pomo-timer");
  const statusEl = document.getElementById("lc-pomo-status");
  if (!timerEl) return;

  const mins = Math.floor(pomodoroSeconds / 60);
  const secs = pomodoroSeconds % 60;
  timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  if (statusEl) {
    if (!pomodoroRunning && pomodoroSeconds === 0) {
      statusEl.textContent = "准备开始专注";
    } else if (pomodoroRunning && pomodoroIsWork) {
      statusEl.textContent = "🍅 专注中...加油！";
    } else if (pomodoroRunning && !pomodoroIsWork) {
      statusEl.textContent = "☕ 休息中～放松一下";
    } else {
      statusEl.textContent = pomodoroIsWork ? "专注暂停中" : "休息暂停中";
    }
  }

  // Update today count
  const data = getData();
  if (data.pomodoroTodayDate !== todayStr()) {
    data.pomodoroTodayDate = todayStr();
    data.pomodoroTodayCount = 0;
    saveData();
  }
  const todayEl = document.getElementById("lc-pomo-today");
  if (todayEl) todayEl.textContent = data.pomodoroTodayCount;
  const totalEl = document.getElementById("lc-pomo-total");
  if (totalEl) totalEl.textContent = data.pomodoroCompleted;
}

function startPomodoro() {
  const data = getData();
  if (pomodoroSeconds === 0) {
    const workMin = parseInt(document.getElementById("lc-pomo-work")?.value) || data.pomodoroWorkMin;
    data.pomodoroWorkMin = workMin;
    pomodoroSeconds = workMin * 60;
    pomodoroIsWork = true;
    saveData();
  }

  pomodoroRunning = true;
  document.getElementById("lc-pomo-start").style.display = "none";
  document.getElementById("lc-pomo-pause").style.display = "";

  pomodoroTimer = setInterval(() => {
    pomodoroSeconds--;
    updatePomodoroDisplay();

    if (pomodoroSeconds <= 0) {
      clearInterval(pomodoroTimer);
      pomodoroRunning = false;

      if (pomodoroIsWork) {
        // Work done!
        data.pomodoroCompleted++;
        if (data.pomodoroTodayDate === todayStr()) {
          data.pomodoroTodayCount++;
        } else {
          data.pomodoroTodayDate = todayStr();
          data.pomodoroTodayCount = 1;
        }
        saveData();

        showToast("🍅 专注完成！休息一下吧～");

        // Notify through chat
        try {
          const context = getContext();
          if (context && context.chat && context.chat.length > 0) {
            context.sendSystemMessage("generic",
              `[🍅 番茄钟] 用户刚完成了一个专注时段（${data.pomodoroWorkMin}分钟）！今日已完成 ${data.pomodoroTodayCount} 个番茄，累计 ${data.pomodoroCompleted} 个。请夸夸TA！`
            );
          }
        } catch (e) {}

        // Start break
        pomodoroIsWork = false;
        const breakMin = parseInt(document.getElementById("lc-pomo-break")?.value) || data.pomodoroBreakMin;
        pomodoroSeconds = breakMin * 60;
        data.pomodoroBreakMin = breakMin;
        saveData();
        startPomodoro();
      } else {
        // Break done!
        showToast("☕ 休息结束！准备下一个番茄？");
        document.getElementById("lc-pomo-start").style.display = "";
        document.getElementById("lc-pomo-pause").style.display = "none";
        updatePomodoroDisplay();
      }
    }
  }, 1000);
}

function pausePomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroRunning = false;
  document.getElementById("lc-pomo-start").style.display = "";
  document.getElementById("lc-pomo-pause").style.display = "none";
  updatePomodoroDisplay();
}

function resetPomodoro() {
  clearInterval(pomodoroTimer);
  pomodoroRunning = false;
  pomodoroSeconds = 0;
  pomodoroIsWork = true;
  document.getElementById("lc-pomo-start").style.display = "";
  document.getElementById("lc-pomo-pause").style.display = "none";
  updatePomodoroDisplay();
}


// ============================================
// STUDY - VOCAB MODULE
// ============================================
let currentVocabIndex = -1;

function getVocabList() {
  const data = getData();
  if (!data.vocabList || data.vocabList.length === 0) {
    data.vocabList = [...DEFAULT_VOCAB];
    saveData();
  }
  return data.vocabList;
}

function showNextVocab() {
  const list = getVocabList();
  if (list.length === 0) {
    showToast("词库为空，请先添加单词！");
    return;
  }

  // Prioritize words the user got wrong or hasn't seen
  const data = getData();
  const progress = data.vocabProgress || {};

  // Score: unseen > wrong > correct
  const scored = list.map((item, idx) => {
    const p = progress[item.word];
    let score = 0;
    if (!p) score = 100; // Unseen
    else score = Math.max(0, 50 - (p.correct || 0) * 10 + (p.wrong || 0) * 20);
    // Add randomness
    score += Math.random() * 30;
    return { idx, score };
  });

  scored.sort((a, b) => b.score - a.score);
  currentVocabIndex = scored[0].idx;

  const word = list[currentVocabIndex];
  const wordEl = document.getElementById("lc-vocab-word");
  const phoneticEl = document.getElementById("lc-vocab-phonetic");
  const meaningEl = document.getElementById("lc-vocab-meaning");

  if (wordEl) wordEl.textContent = word.word;
  if (phoneticEl) phoneticEl.textContent = word.phonetic || "";
  if (meaningEl) {
    meaningEl.textContent = word.meaning;
    meaningEl.classList.remove("show");
  }
}

function showVocabMeaning() {
  const meaningEl = document.getElementById("lc-vocab-meaning");
  if (meaningEl) meaningEl.classList.toggle("show");
}

function markVocab(known) {
  const list = getVocabList();
  if (currentVocabIndex < 0 || currentVocabIndex >= list.length) return;

  const data = getData();
  if (!data.vocabProgress) data.vocabProgress = {};
  const word = list[currentVocabIndex].word;

  if (!data.vocabProgress[word]) {
    data.vocabProgress[word] = { correct: 0, wrong: 0, lastReview: null };
  }

  if (known) {
    data.vocabProgress[word].correct++;
  } else {
    data.vocabProgress[word].wrong++;
  }
  data.vocabProgress[word].lastReview = new Date().toISOString();
  saveData();

  showToast(known ? "✅ 记住了！" : "📝 加强记忆～");
  showNextVocab();
}

function renderVocabManage() {
  const list = getVocabList();
  const countEl = document.getElementById("lc-vocab-count");
  if (countEl) countEl.textContent = list.length;

  const container = document.getElementById("lc-vocab-list-manage");
  if (!container) return;

  // Show last 50
  const recent = list.slice(-50).reverse();
  container.innerHTML = recent.map((item, i) => `
    <div class="lc-vocab-list-item">
      <span><b>${item.word}</b> ${item.phonetic || ''} - ${item.meaning}</span>
      <button class="lc-btn lc-btn-danger lc-btn-sm" data-del-vocab="${list.length - 1 - i}" style="padding:2px 6px;">✕</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-del-vocab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.delVocab);
      const data = getData();
      data.vocabList.splice(idx, 1);
      saveData();
      renderVocabManage();
      showToast("已删除");
    });
  });
}

function addVocab() {
  const word = document.getElementById("lc-vocab-add-word")?.value?.trim();
  const phonetic = document.getElementById("lc-vocab-add-phonetic")?.value?.trim();
  const meaning = document.getElementById("lc-vocab-add-meaning")?.value?.trim();

  if (!word || !meaning) {
    showToast("请填写单词和释义～");
    return;
  }

  const data = getData();
  if (!data.vocabList) data.vocabList = [];

  // Check duplicate
  if (data.vocabList.some(v => v.word.toLowerCase() === word.toLowerCase())) {
    showToast("这个单词已经在词库里了～");
    return;
  }

  data.vocabList.push({ word, phonetic: phonetic || "", meaning });
  saveData();

  document.getElementById("lc-vocab-add-word").value = "";
  document.getElementById("lc-vocab-add-phonetic").value = "";
  document.getElementById("lc-vocab-add-meaning").value = "";
  renderVocabManage();
  showToast("单词已添加 📖");
}

function loadDefaultVocab() {
  const data = getData();
  const existing = new Set((data.vocabList || []).map(v => v.word.toLowerCase()));
  let added = 0;
  for (const v of DEFAULT_VOCAB) {
    if (!existing.has(v.word.toLowerCase())) {
      data.vocabList.push({ ...v });
      added++;
    }
  }
  saveData();
  renderVocabManage();
  showToast(`已载入 ${added} 个新单词！`);
}


// ============================================
// STUDY - QUIZ MODULE
// ============================================
let quizQuestions = [];
let quizCurrent = 0;
let quizCorrect = 0;
let quizTotal = 10;

function generateQuiz() {
  const list = getVocabList();
  if (list.length < 4) {
    showToast("词库至少需要4个单词才能出题哦～");
    return;
  }

  quizQuestions = [];
  quizCurrent = 0;
  quizCorrect = 0;
  const count = Math.min(quizTotal, list.length);

  // Shuffle and pick
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  for (const item of selected) {
    // Generate 3 wrong options
    const wrongs = list
      .filter(w => w.word !== item.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [
      { text: item.meaning, correct: true },
      ...wrongs.map(w => ({ text: w.meaning, correct: false }))
    ].sort(() => Math.random() - 0.5);

    quizQuestions.push({
      word: item.word,
      phonetic: item.phonetic,
      options: options,
    });
  }

  showQuizQuestion();
}

function showQuizQuestion() {
  const container = document.getElementById("lc-quiz-question");
  const scoreEl = document.getElementById("lc-quiz-score");
  const areaEl = document.getElementById("lc-quiz-area");

  if (!container) return;

  if (quizCurrent >= quizQuestions.length) {
    // Quiz done
    container.style.display = "none";
    if (areaEl) areaEl.innerHTML = `<button class="lc-btn lc-btn-primary lc-btn-block" id="lc-quiz-start">再来一轮</button>`;
    document.getElementById("lc-quiz-start")?.addEventListener("click", generateQuiz);
    if (scoreEl) {
      const pct = Math.round((quizCorrect / quizQuestions.length) * 100);
      scoreEl.innerHTML = `🎉 答题结束！正确率：${quizCorrect}/${quizQuestions.length} (${pct}%)`;

      // Log quiz result
      const data = getData();
      data.quizHistory.push({
        date: new Date().toLocaleString("zh-CN"),
        total: quizQuestions.length,
        correct: quizCorrect,
      });
      if (data.quizHistory.length > 100) data.quizHistory = data.quizHistory.slice(-100);
      saveData();
    }

    // Notify via chat
    try {
      const context = getContext();
      if (context && context.chat && context.chat.length > 0) {
        const pct = Math.round((quizCorrect / quizQuestions.length) * 100);
        context.sendSystemMessage("generic",
          `[📚 学习报告] 用户刚完成了一轮单词测试！正确率：${quizCorrect}/${quizQuestions.length} (${pct}%)。${pct >= 80 ? '表现很棒，请夸夸TA！' : '还需要加油，请鼓励TA！'}`
        );
      }
    } catch (e) {}

    return;
  }

  const q = quizQuestions[quizCurrent];
  if (areaEl) areaEl.innerHTML = "";
  if (scoreEl) scoreEl.textContent = `第 ${quizCurrent + 1}/${quizQuestions.length} 题 | 正确 ${quizCorrect}`;

  container.style.display = "block";
  container.innerHTML = `
    <div style="text-align:center; margin-bottom:12px;">
      <div style="font-size:24px; font-weight:700; color:var(--SmartThemeBodyColor,#eee);">${q.word}</div>
      <div style="font-size:12px; color:var(--SmartThemeBodyColor,#888);">${q.phonetic || ''}</div>
      <div style="font-size:12px; color:var(--SmartThemeBodyColor,#888); margin-top:4px;">请选择正确的释义：</div>
    </div>
    ${q.options.map((opt, i) => `
      <button class="lc-quiz-option" data-correct="${opt.correct}" data-idx="${i}">
        ${String.fromCharCode(65 + i)}. ${opt.text}
      </button>
    `).join("")}
  `;

  container.querySelectorAll(".lc-quiz-option").forEach(btn => {
    btn.addEventListener("click", () => {
      // Disable all buttons
      container.querySelectorAll(".lc-quiz-option").forEach(b => {
        b.style.pointerEvents = "none";
        if (b.dataset.correct === "true") b.classList.add("correct");
      });

      if (btn.dataset.correct === "true") {
        quizCorrect++;
        btn.classList.add("correct");
      } else {
        btn.classList.add("wrong");
      }

      // Update vocab progress
      const data = getData();
      if (!data.vocabProgress) data.vocabProgress = {};
      const word = q.word;
      if (!data.vocabProgress[word]) data.vocabProgress[word] = { correct: 0, wrong: 0, lastReview: null };
      if (btn.dataset.correct === "true") data.vocabProgress[word].correct++;
      else data.vocabProgress[word].wrong++;
      data.vocabProgress[word].lastReview = new Date().toISOString();
      saveData();

      // Next question after delay
      setTimeout(() => {
        quizCurrent++;
        showQuizQuestion();
      }, 1000);
    });
  });
}


// ============================================
// SETTINGS MODULE
// ============================================
function initSettings() {
  const data = getData();

  const bindToggle = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        data.settings[key] = el.checked;
        saveData();
        if (key === "floatButtonVisible") {
          const btn = document.getElementById("lc-float-btn");
          if (btn) btn.style.display = el.checked ? "" : "none";
        }
      });
    }
  };

  bindToggle("lc-set-mood-inject", "moodInjectEnabled");
  bindToggle("lc-set-diary-inject", "diaryInjectEnabled");
  bindToggle("lc-set-events", "lifeEventsEnabled");
  bindToggle("lc-set-reminders", "remindersEnabled");
  bindToggle("lc-set-reminder-chat", "reminderViaChatEnabled");
  bindToggle("lc-set-float-btn", "floatButtonVisible");

  // Clear all data
  const clearBtn = document.getElementById("lc-clear-all-data");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("确定要清除所有生活伴侣的数据吗？此操作不可撤销！")) {
        extension_settings[extensionName].data = JSON.parse(JSON.stringify(defaultData));
        saveData();
        refreshAllViews();
        showToast("所有数据已清除");
      }
    });
  }
}


// ============================================
// CHAT INJECTION (PROMPT ENGINEERING)
// ============================================
function onChatPromptReady(eventData) {
  try {
    // Inject mood and diary context
    const moodInjection = getMoodPromptInjection();
    const diaryInjection = getDiaryPromptInjection();

    const injection = [moodInjection, diaryInjection].filter(s => s).join("\n");

    if (injection && eventData) {
      // Try to add to the system prompt area
      // Different ST versions handle this differently
      if (typeof eventData === 'string') {
        return eventData + "\n" + injection;
      }
    }
  } catch (e) {
    console.log("[LifeCompanion] Injection error:", e);
  }
}


// ============================================
// REFRESH ALL VIEWS
// ============================================
function refreshAllViews() {
  renderMoodGrid();
  renderMoodHistory();
  renderDiaryList();
  renderReminders();
  renderEventLog();
  renderFoodLog();
  renderVocabManage();
  updatePomodoroDisplay();
}


// ============================================
// BIND ALL EVENTS
// ============================================
function bindEvents() {
  // Panel open/close
  document.getElementById("lc-float-btn")?.addEventListener("click", togglePanel);
  document.getElementById("lc-close-panel")?.addEventListener("click", closePanel);

  // Mood
  document.getElementById("lc-mood-save")?.addEventListener("click", saveMood);

  // Diary
  document.getElementById("lc-diary-save")?.addEventListener("click", saveDiary);

  // Reminders
  document.getElementById("lc-reminder-add")?.addEventListener("click", addReminder);

  // Events
  document.getElementById("lc-event-preview-btn")?.addEventListener("click", previewEvent);
  const freqInput = document.getElementById("lc-event-freq");
  if (freqInput) {
    freqInput.addEventListener("change", () => {
      const data = getData();
      data.lifeEventFrequency = Math.max(1, parseInt(freqInput.value) || 5);
      saveData();
    });
  }

  // Food
  document.getElementById("lc-food-save")?.addEventListener("click", saveFood);

  // Pomodoro
  document.getElementById("lc-pomo-start")?.addEventListener("click", startPomodoro);
  document.getElementById("lc-pomo-pause")?.addEventListener("click", pausePomodoro);
  document.getElementById("lc-pomo-reset")?.addEventListener("click", resetPomodoro);

  // Vocab
  document.getElementById("lc-vocab-card")?.addEventListener("click", showVocabMeaning);
  document.getElementById("lc-vocab-show")?.addEventListener("click", showVocabMeaning);
  document.getElementById("lc-vocab-know")?.addEventListener("click", () => markVocab(true));
  document.getElementById("lc-vocab-forgot")?.addEventListener("click", () => markVocab(false));
  document.getElementById("lc-vocab-next")?.addEventListener("click", showNextVocab);
  document.getElementById("lc-vocab-add-btn")?.addEventListener("click", addVocab);
  document.getElementById("lc-vocab-load-default")?.addEventListener("click", loadDefaultVocab);

  // Quiz
  document.getElementById("lc-quiz-start")?.addEventListener("click", generateQuiz);

  // Settings
  initSettings();
}


// ============================================
// EXTENSION SETTINGS PANEL (in ST sidebar)
// ============================================
function addExtensionSettings() {
  const html = `
  <div id="lc-extension-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>🌙 生活伴侣 Life Companion</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <p style="font-size:12px; margin-bottom:8px;">点击右下角 🌙 按钮或下方按钮打开面板。</p>
        <div class="menu_button" id="lc-open-from-settings">打开生活伴侣面板</div>
      </div>
    </div>
  </div>
  `;
  $("#extensions_settings2").append(html);
  $("#lc-open-from-settings").on("click", () => openPanel());
}


// ============================================
// INITIALIZATION
// ============================================
jQuery(async () => {
  console.log("[LifeCompanion] 🌙 Loading Life Companion...");

  // Initialize data
  getData();

  // Add extension settings in sidebar
  addExtensionSettings();

  // Inject panel HTML
  $("body").append(buildPanelHTML());

  // Float button visibility
  const data = getData();
  if (!data.settings.floatButtonVisible) {
    const btn = document.getElementById("lc-float-btn");
    if (btn) btn.style.display = "none";
  }

  // Initialize tabs
  initTabs();

  // Bind all events
  bindEvents();

  // Start reminder checker
  startReminderChecker();

  // Show first vocab
  showNextVocab();

  // ---- ST Event Hooks ----

  // When user sends a message: try inject life event
  eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
    tryInjectLifeEvent();
  });

  // Inject mood/diary into prompt
  // Note: Different ST versions may use different event names
  // This attempts the most common approach
  try {
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (eventData) => {
      const injection = onChatPromptReady(eventData);
      if (injection) return injection;
    });
  } catch (e) {
    console.log("[LifeCompanion] Could not bind to prompt generation event, trying alternative...");
    try {
      eventSource.on("generate_before_combine_prompts", (eventData) => {
        return onChatPromptReady(eventData);
      });
    } catch (e2) {
      console.log("[LifeCompanion] Prompt injection hook not available. Mood/diary will use system messages instead.");
    }
  }

  // Alternative: Inject via chat_completion_prompt_manager if available
  // This hook injects context as an Author's Note style approach
  try {
    eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, () => {
      const moodInjection = getMoodPromptInjection();
      const diaryInjection = getDiaryPromptInjection();
      const combined = [moodInjection, diaryInjection].filter(s => s).join("\n");

      if (combined) {
        const context = getContext();
        if (context?.extensionPrompts) {
          context.setExtensionPrompt(extensionName, combined, 1, 0);
        }
      }
    });
  } catch (e) {
    console.log("[LifeCompanion] Extension prompt injection not available");
  }

  console.log("[LifeCompanion] 🌙 Life Companion loaded successfully!");
});
