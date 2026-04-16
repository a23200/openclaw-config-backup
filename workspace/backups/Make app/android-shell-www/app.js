const spec = {
  "name": "轻约到店",
  "slug": "app-imfygi",
  "prompt": "做一个预约服务 App，用户可以选择门店和时间、在线支付、查看预约记录、接收到店提醒，并支持评价和客服咨询。",
  "category": "booking",
  "summary": "围绕时间与服务资源编排，适合到店、咨询、医疗、美业等业务。",
  "audience": "需要预约服务的用户",
  "valueProp": "减少人工沟通，提升到店与履约效率",
  "monetization": "预约成交、增值套餐、复购提醒",
  "platform": "android",
  "platformLabel": "Android 优先",
  "palette": {
    "id": "emerald",
    "name": "森系绿",
    "description": "适合健康、预约、服务型产品",
    "accent": "#0f9d71",
    "accentSoft": "rgba(15, 157, 113, 0.14)",
    "accentStrong": "#056449",
    "contrast": "#ffffff",
    "surface": "#effcf7",
    "surfaceStrong": "#d4f5e7",
    "gradient": "linear-gradient(135deg, #0f9d71 0%, #3ddc97 100%)"
  },
  "features": [
    "订单与记录管理",
    "支付闭环",
    "评论与反馈",
    "消息提醒中心",
    "客服协助入口",
    "预约服务",
    "用户可以选择门店和时间",
    "在线支付"
  ],
  "screens": [
    {
      "id": "home",
      "name": "首页",
      "subtitle": "服务入口",
      "heroTitle": "门店与服务项目推荐",
      "metricLabel": "预约转化",
      "metricValue": "81%",
      "chips": [
        "订单与记录管理",
        "支付闭环",
        "评论与反馈"
      ],
      "sections": [
        {
          "title": "服务入口",
          "caption": "自动提炼自需求",
          "items": [
            "订单与记录管理",
            "支付闭环",
            "评论与反馈"
          ]
        },
        {
          "title": "预约前置",
          "caption": "适合 MVP 的补全建议",
          "items": [
            "支付闭环",
            "评论与反馈",
            "消息提醒中心"
          ]
        }
      ]
    },
    {
      "id": "booking",
      "name": "预约",
      "subtitle": "核心流程",
      "heroTitle": "选择门店、人员与时间段",
      "metricLabel": "完成率",
      "metricValue": "90%",
      "chips": [
        "支付闭环",
        "评论与反馈",
        "消息提醒中心"
      ],
      "sections": [
        {
          "title": "预约步骤",
          "caption": "自动提炼自需求",
          "items": [
            "评论与反馈",
            "消息提醒中心",
            "客服协助入口"
          ]
        },
        {
          "title": "确认信息",
          "caption": "适合 MVP 的补全建议",
          "items": [
            "消息提醒中心",
            "客服协助入口",
            "预约服务"
          ]
        }
      ]
    },
    {
      "id": "record",
      "name": "记录",
      "subtitle": "履约跟踪",
      "heroTitle": "预约记录与到店提醒",
      "metricLabel": "准时率",
      "metricValue": "70%",
      "chips": [
        "评论与反馈",
        "消息提醒中心",
        "客服协助入口"
      ],
      "sections": [
        {
          "title": "记录管理",
          "caption": "自动提炼自需求",
          "items": [
            "客服协助入口",
            "预约服务",
            "用户可以选择门店和时间"
          ]
        },
        {
          "title": "售后服务",
          "caption": "适合 MVP 的补全建议",
          "items": [
            "预约服务",
            "用户可以选择门店和时间",
            "在线支付"
          ]
        }
      ]
    },
    {
      "id": "profile",
      "name": "我的",
      "subtitle": "偏好沉淀",
      "heroTitle": "常用门店与个人资料",
      "metricLabel": "复购预期",
      "metricValue": "79%",
      "chips": [
        "消息提醒中心",
        "客服协助入口",
        "预约服务"
      ],
      "sections": [
        {
          "title": "个人资产",
          "caption": "自动提炼自需求",
          "items": [
            "用户可以选择门店和时间",
            "在线支付",
            "消息提醒中心"
          ]
        },
        {
          "title": "设置管理",
          "caption": "适合 MVP 的补全建议",
          "items": [
            "在线支付",
            "客服协助入口",
            "账号资料"
          ]
        }
      ]
    }
  ],
  "highlights": [
    "8 个核心模块",
    "4 张关键界面",
    "时段选择 + 本地预约记录",
    "本地数据直接可用"
  ],
  "localModule": {
    "kind": "schedule",
    "title": "时段选择 + 本地预约记录",
    "description": "用户可以直接在 App 里选择时段并生成本地预约记录，不需要后台也能演示流程。",
    "primaryAction": "立即预约",
    "emptyState": "没有可用时段",
    "tips": [
      "点击时段即可预约",
      "预约记录自动保存在本机",
      "适合门店、咨询、服务预约"
    ],
    "sampleItems": [
      {
        "id": "slot-1",
        "title": "门店咨询",
        "subtitle": "今天 18:30",
        "meta": "虹桥门店 · 订单与记录管理",
        "badge": "可约"
      },
      {
        "id": "slot-2",
        "title": "护理体验",
        "subtitle": "今天 20:00",
        "meta": "静安门店",
        "badge": "热门"
      },
      {
        "id": "slot-3",
        "title": "复诊回访",
        "subtitle": "明天 10:30",
        "meta": "远程视频",
        "badge": "推荐"
      }
    ]
  },
  "packageContents": [
    "安卓 App 页面骨架与多屏预览",
    "本地功能模块：时段选择 + 本地预约记录",
    "localStorage 持久化：关闭后再次打开仍保留数据",
    "PWA 文件：manifest、service worker、离线缓存"
  ],
  "buildSteps": [
    "输入需求并生成预览，确认页面结构和本地功能模块。",
    "生成正式版 APK，直接安装到安卓手机。",
    "打开 App 后即可直接使用本地功能。",
    "如需联网能力，再继续接入正式接口。"
  ],
  "installNote": "当前生成的 App 打开后自带“时段选择 + 本地预约记录”，数据仅保存在当前设备，本地即可使用。"
};
const app = document.getElementById('app');
const localModule = spec.localModule;
const storageKey = spec.slug + '-local-app-v1';
let activeScreenId = spec.screens[0]?.id ?? '';
let state = loadState();

function createInitialState() {
  return {
    search: '',
    quickInput: '',
    favorites: [],
    cart: [],
    bookings: [],
    liked: [],
    saved: [],
    completed: [],
    entries: getInitialEntries(),
  };
}

function getInitialEntries() {
  switch (localModule.kind) {
    case 'ledger':
      return localModule.sampleItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        meta: item.meta,
        value: item.value ?? 0,
      }));
    case 'tasks':
    case 'checklist':
    case 'tracker':
      return localModule.sampleItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        meta: item.meta,
      }));
    case 'notes':
      return localModule.sampleItems.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        meta: item.meta,
      }));
    default:
      return [];
  }
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return createInitialState();
    }

    return { ...createInitialState(), ...JSON.parse(raw) };
  } catch (error) {
    console.error(error);
    return createInitialState();
  }
}

function saveState() {
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

function getFilteredSampleItems() {
  const query = state.search.trim().toLowerCase();

  return localModule.sampleItems.filter((item) => {
    const text = [item.title, item.subtitle, item.meta, item.badge].join(' ').toLowerCase();
    return query ? text.includes(query) : true;
  });
}

function getFilteredEntries() {
  const query = state.search.trim().toLowerCase();

  return state.entries.filter((item) => {
    const text = [item.title, item.subtitle || '', item.meta || ''].join(' ').toLowerCase();
    return query ? text.includes(query) : true;
  });
}

function toggleInList(key, id) {
  const current = new Set(state[key]);

  if (current.has(id)) {
    current.delete(id);
  } else {
    current.add(id);
  }

  state[key] = Array.from(current);
  saveState();
  render();
}

function addEntry() {
  const value = state.quickInput.trim();

  if (!value) {
    return;
  }

  if (localModule.kind === 'feed') {
    state.entries = [
      {
        id: 'draft-' + Date.now(),
        title: value,
        subtitle: '本地草稿动态',
        meta: '刚刚保存',
      },
      ...state.entries,
    ];
  } else if (localModule.kind === 'ledger') {
    const match = value.match(/^(.*?)(\d+(?:\.\d+)?)$/);
    const title = (match?.[1] ?? value).trim() || '本地账单';
    const amount = Number(match?.[2] ?? 0);

    state.entries = [
      {
        id: 'bill-' + Date.now(),
        title,
        subtitle: '手动新增本地账单',
        meta: '¥' + amount,
        value: amount,
      },
      ...state.entries,
    ];
  } else {
    state.entries = [
      {
        id: 'entry-' + Date.now(),
        title: value,
        subtitle: '手动新增内容',
        meta: '本地保存',
      },
      ...state.entries,
    ];
  }

  state.quickInput = '';
  saveState();
  render();
}

function removeEntry(id) {
  state.entries = state.entries.filter((item) => item.id !== id);
  saveState();
  render();
}

function createBooking(itemId) {
  const item = localModule.sampleItems.find((entry) => entry.id === itemId);

  if (!item) {
    return;
  }

  state.bookings = [
    { id: 'booking-' + Date.now(), title: item.title, subtitle: item.subtitle, meta: item.meta },
    ...state.bookings,
  ];
  saveState();
  render();
}

function getModuleSummary() {
  const sampleItems = getFilteredSampleItems();

  switch (localModule.kind) {
    case 'catalog':
      return [
        { label: '可浏览商品', value: String(sampleItems.length) },
        { label: '已收藏', value: String(state.favorites.length) },
        { label: '购物车', value: String(state.cart.length) },
      ];
    case 'schedule':
      return [
        { label: '可预约时段', value: String(sampleItems.length) },
        { label: '本地预约', value: String(state.bookings.length) },
        { label: '数据模式', value: '本机' },
      ];
    case 'feed':
      return [
        { label: '动态内容', value: String(sampleItems.length + state.entries.length) },
        { label: '已点赞', value: String(state.liked.length) },
        { label: '已收藏', value: String(state.saved.length) },
      ];
    case 'ledger':
      return [
        { label: '账单笔数', value: String(state.entries.length) },
        { label: '总金额', value: '¥' + state.entries.reduce((sum, item) => sum + (item.value || 0), 0) },
        { label: '数据模式', value: '本机' },
      ];
    case 'tasks':
    case 'checklist':
    case 'tracker':
      return [
        { label: '总项目', value: String(getFilteredEntries().length) },
        { label: '已完成', value: String(state.completed.length) },
        { label: '数据模式', value: '本机' },
      ];
    default:
      return [
        { label: '内容条数', value: String(state.entries.length) },
        { label: '本地保存', value: '已开启' },
        { label: '数据模式', value: '本机' },
      ];
  }
}

function renderLocalList() {
  if (localModule.kind === 'catalog') {
    const items = getFilteredSampleItems();

    if (!items.length) {
      return '<p class="empty">' + localModule.emptyState + '</p>';
    }

    return '<div class="item-list">' + items.map((item) => {
      const favored = state.favorites.includes(item.id);
      const carted = state.cart.includes(item.id);

      return '<div class="item-card">' +
        '<div class="item-head"><div><strong>' + item.title + '</strong><p class="small">' + item.subtitle + '</p></div><span class="status">' + item.badge + '</span></div>' +
        '<div class="item-meta"><span>' + item.meta + '</span><span>' + (item.value ? '¥' + item.value : '') + '</span></div>' +
        '<div class="list-actions">' +
        '<button class="secondary" data-action="toggle-favorite" data-id="' + item.id + '">' + (favored ? '已收藏' : localModule.secondaryAction) + '</button>' +
        '<button class="primary" data-action="toggle-cart" data-id="' + item.id + '">' + (carted ? '已加入' : localModule.primaryAction) + '</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  if (localModule.kind === 'schedule') {
    const items = getFilteredSampleItems();

    return '<div class="item-list">' + (items.length ? items.map((item) =>
      '<div class="item-card">' +
        '<div class="item-head"><div><strong>' + item.title + '</strong><p class="small">' + item.subtitle + '</p></div><span class="status">' + item.badge + '</span></div>' +
        '<div class="item-meta"><span>' + item.meta + '</span></div>' +
        '<div class="list-actions"><button class="primary" data-action="book" data-id="' + item.id + '">' + localModule.primaryAction + '</button></div>' +
      '</div>',
    ).join('') : '<p class="empty">' + localModule.emptyState + '</p>') + '</div>';
  }

  if (localModule.kind === 'feed') {
    const merged = [...state.entries, ...getFilteredSampleItems()];

    return '<div class="item-list">' + (merged.length ? merged.map((item) => {
      const liked = state.liked.includes(item.id);
      const saved = state.saved.includes(item.id);

      return '<div class="item-card">' +
        '<div class="item-head"><div><strong>' + item.title + '</strong><p class="small">' + item.subtitle + '</p></div><span class="status">' + (item.badge || '动态') + '</span></div>' +
        '<div class="item-meta"><span>' + (item.meta || '本地内容') + '</span></div>' +
        '<div class="list-actions">' +
        '<button class="secondary" data-action="toggle-save" data-id="' + item.id + '">' + (saved ? '已收藏' : '收藏') + '</button>' +
        '<button class="primary" data-action="toggle-like" data-id="' + item.id + '">' + (liked ? '已点赞' : '点赞') + '</button>' +
        '</div></div>';
    }).join('') : '<p class="empty">' + localModule.emptyState + '</p>') + '</div>';
  }

  const items = getFilteredEntries();

  return '<div class="item-list">' + (items.length ? items.map((item) => {
    const completed = state.completed.includes(item.id);
    const actionLabel = localModule.kind === 'notes' ? '删除' : completed ? '已完成' : localModule.primaryAction;
    const action = localModule.kind === 'notes' ? 'remove-entry' : 'toggle-completed';

    return '<div class="item-card">' +
      '<div class="item-head"><div><strong>' + item.title + '</strong><p class="small">' + item.subtitle + '</p></div><span class="status">' + (completed ? '完成' : (item.meta || '本地')) + '</span></div>' +
      '<div class="item-meta"><span>' + (item.meta || '本地保存') + '</span></div>' +
      '<div class="list-actions">' +
      '<button class="' + (localModule.kind === 'notes' ? 'secondary' : 'primary') + '" data-action="' + action + '" data-id="' + item.id + '">' + actionLabel + '</button>' +
      (localModule.kind !== 'notes' ? '<button class="secondary" data-action="remove-entry" data-id="' + item.id + '">删除</button>' : '') +
      '</div></div>';
  }).join('') : '<p class="empty">' + localModule.emptyState + '</p>') + '</div>';
}

function renderAsideContent() {
  if (localModule.kind === 'schedule') {
    return '<div class="aside-card"><strong>本地预约记录</strong>' +
      (state.bookings.length ? '<ul class="aside-list">' + state.bookings.map((item) => '<li><span>' + item.title + '</span><span>' + item.subtitle + '</span></li>').join('') + '</ul>' : '<p>还没有预约记录，先点一个时段试试看。</p>') +
      '</div>';
  }

  return '<div class="aside-card"><strong>使用提示</strong><ul class="aside-list">' +
    localModule.tips.map((tip) => '<li><span>' + tip + '</span></li>').join('') +
    '</ul><strong>打开方式</strong><p>部署到 HTTPS 后，安卓浏览器直接打开即可；数据仅保存在当前设备。</p></div>';
}

function render() {
  const activeScreen =
    spec.screens.find((screen) => screen.id === activeScreenId) ?? spec.screens[0];
  const summary = getModuleSummary();

  app.innerHTML = `
    <div class="shell">
      <section class="hero">
        <article class="card">
          <span class="badge">安卓 App 本地功能</span>
          <h1>${spec.name}</h1>
          <p class="summary">${spec.summary}</p>
          <div class="pill-row">
            ${spec.highlights.map((item) => `<span>${item}</span>`).join('')}
          </div>
        </article>
        <article class="phone">
          <div class="phone-screen">
            <div class="screen-head">
              <div>
                <small>${activeScreen.subtitle}</small>
                <h3>${activeScreen.heroTitle}</h3>
              </div>
              <div class="metric">
                <span>${activeScreen.metricLabel}</span>
                <strong>${activeScreen.metricValue}</strong>
              </div>
            </div>
            <div class="screen-tabs">
              ${spec.screens
                .map(
                  (screen) => `<button data-screen-id="${screen.id}" class="${screen.id === activeScreenId ? 'active' : ''}">${screen.name}</button>`,
                )
                .join('')}
            </div>
            <div class="pill-row">
              ${activeScreen.chips.map((item) => `<span class="tag">${item}</span>`).join('')}
            </div>
            <div class="item-list">
              ${activeScreen.sections
                .map(
                  (section) => `
                    <div class="item-card">
                      <div class="item-head">
                        <div><strong>${section.title}</strong><p class="small">${section.caption}</p></div>
                      </div>
                      <ul>
                        ${section.items.map((item) => `<li>${item}</li>`).join('')}
                      </ul>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </div>
        </article>
      </section>

      <section class="grid">
        <article class="card">
          <div class="local-head">
            <div>
              <span class="badge">本地功能</span>
              <h2>${localModule.title}</h2>
            </div>
            <span class="summary-chip">无需后端</span>
          </div>
          <p class="summary">${localModule.description}</p>

          <div class="summary-grid">
            ${summary
              .map(
                (item) => `<div class="summary-box"><span>${item.label}</span><strong>${item.value}</strong></div>`,
              )
              .join('')}
          </div>

          <div class="search-row">
            <input data-role="search" value="${state.search}" placeholder="搜索当前内容" />
          </div>

          ${localModule.quickAddPlaceholder
            ? `<form class="quick-row" data-role="quick-form">
                <input data-role="quick-input" value="${state.quickInput}" placeholder="${localModule.quickAddPlaceholder}" />
                <button class="primary" type="submit">添加</button>
              </form>`
            : ''}

          ${renderLocalList()}
        </article>

        <article class="card">
          ${renderAsideContent()}
        </article>
      </section>
    </div>
  `;

  app.querySelectorAll('[data-screen-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      activeScreenId = target.dataset.screenId ?? activeScreenId;
      render();
    });
  });

  const searchInput = app.querySelector('[data-role="search"]');
  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      saveState();
      render();
    });
  }

  const quickInput = app.querySelector('[data-role="quick-input"]');
  if (quickInput instanceof HTMLInputElement) {
    quickInput.addEventListener('input', () => {
      state.quickInput = quickInput.value;
      saveState();
    });
  }

  const quickForm = app.querySelector('[data-role="quick-form"]');
  if (quickForm instanceof HTMLFormElement) {
    quickForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addEntry();
    });
  }

  app.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.dataset.action;
      const id = target.dataset.id;

      if (!action || !id) {
        return;
      }

      if (action === 'toggle-favorite') {
        toggleInList('favorites', id);
      }

      if (action === 'toggle-cart') {
        toggleInList('cart', id);
      }

      if (action === 'book') {
        createBooking(id);
      }

      if (action === 'toggle-like') {
        toggleInList('liked', id);
      }

      if (action === 'toggle-save') {
        toggleInList('saved', id);
      }

      if (action === 'toggle-completed') {
        toggleInList('completed', id);
      }

      if (action === 'remove-entry') {
        removeEntry(id);
      }
    });
  });
}

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}
