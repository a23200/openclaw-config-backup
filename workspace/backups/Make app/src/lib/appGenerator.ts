import JSZip from 'jszip'

export type Platform = 'dual' | 'android' | 'ios'
export type PaletteId = 'violet' | 'ocean' | 'emerald' | 'sunset'
export type PackageTarget = 'pwa' | 'expo'
type AppCategory =
  | 'commerce'
  | 'social'
  | 'booking'
  | 'education'
  | 'fitness'
  | 'finance'
  | 'enterprise'
  | 'generic'

export interface GeneratorFormData {
  appName: string
  prompt: string
  platform: Platform
  palette: PaletteId
}

interface PaletteOption {
  id: PaletteId
  name: string
  description: string
  accent: string
  accentSoft: string
  accentStrong: string
  contrast: string
  surface: string
  surfaceStrong: string
  gradient: string
}

interface ScreenSection {
  title: string
  caption: string
  items: string[]
}

interface ScreenPreview {
  id: string
  name: string
  subtitle: string
  heroTitle: string
  metricLabel: string
  metricValue: string
  chips: string[]
  sections: ScreenSection[]
}

type LocalModuleKind =
  | 'catalog'
  | 'schedule'
  | 'feed'
  | 'checklist'
  | 'tracker'
  | 'ledger'
  | 'tasks'
  | 'notes'

interface LocalModuleItem {
  id: string
  title: string
  subtitle: string
  meta: string
  badge: string
  value?: number
}

interface LocalModuleSpec {
  kind: LocalModuleKind
  title: string
  description: string
  primaryAction: string
  secondaryAction?: string
  quickAddPlaceholder?: string
  emptyState: string
  tips: string[]
  sampleItems: LocalModuleItem[]
}

export interface GeneratedApp {
  name: string
  slug: string
  prompt: string
  category: AppCategory
  summary: string
  audience: string
  valueProp: string
  monetization: string
  platform: Platform
  platformLabel: string
  palette: PaletteOption
  features: string[]
  screens: ScreenPreview[]
  highlights: string[]
  localModule: LocalModuleSpec
  packageContents: string[]
  buildSteps: string[]
  installNote: string
}

export const PACKAGE_LABELS: Record<PackageTarget, string> = {
  pwa: '安卓 App Web 包',
  expo: '安卓 App 工程包',
}

interface ExamplePrompt {
  id: string
  label: string
  appName: string
  prompt: string
  palette: PaletteId
}

interface CategoryCopy {
  name: string
  summary: string
  audience: string
  valueProp: string
  monetization: string
  defaults: string[]
  screens: Array<{
    id: string
    name: string
    subtitle: string
    heroTitle: string
    metricLabel: string
    sectionA: string
    sectionB: string
    sectionADefaults: string[]
    sectionBDefaults: string[]
  }>
}

type ScreenBlueprint = CategoryCopy['screens'][number]

export const PALETTE_OPTIONS: PaletteOption[] = [
  {
    id: 'violet',
    name: '灵感紫',
    description: '适合创新、社区、效率产品',
    accent: '#7c3aed',
    accentSoft: 'rgba(124, 58, 237, 0.14)',
    accentStrong: '#4c1d95',
    contrast: '#ffffff',
    surface: '#f7f3ff',
    surfaceStrong: '#ede6ff',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)',
  },
  {
    id: 'ocean',
    name: '海岸蓝',
    description: '适合企业、教育、工具型产品',
    accent: '#0f62fe',
    accentSoft: 'rgba(15, 98, 254, 0.14)',
    accentStrong: '#003cb3',
    contrast: '#ffffff',
    surface: '#eef5ff',
    surfaceStrong: '#dce9ff',
    gradient: 'linear-gradient(135deg, #0f62fe 0%, #42a5f5 100%)',
  },
  {
    id: 'emerald',
    name: '森系绿',
    description: '适合健康、预约、服务型产品',
    accent: '#0f9d71',
    accentSoft: 'rgba(15, 157, 113, 0.14)',
    accentStrong: '#056449',
    contrast: '#ffffff',
    surface: '#effcf7',
    surfaceStrong: '#d4f5e7',
    gradient: 'linear-gradient(135deg, #0f9d71 0%, #3ddc97 100%)',
  },
  {
    id: 'sunset',
    name: '落日橙',
    description: '适合电商、内容、消费产品',
    accent: '#f97316',
    accentSoft: 'rgba(249, 115, 22, 0.14)',
    accentStrong: '#c2410c',
    contrast: '#ffffff',
    surface: '#fff5ed',
    surfaceStrong: '#ffe3cf',
    gradient: 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)',
  },
]

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: 'commerce',
    label: '电商商城',
    appName: '潮流商城',
    palette: 'sunset',
    prompt:
      '做一个潮流电商 App，需要首页推荐、商品分类、搜索、商品详情、购物车、订单、优惠券、会员中心和消息提醒。',
  },
  {
    id: 'booking',
    label: '预约服务',
    appName: '轻约到店',
    palette: 'emerald',
    prompt:
      '做一个预约服务 App，用户可以选择门店和时间、在线支付、查看预约记录、接收到店提醒，并支持评价和客服咨询。',
  },
  {
    id: 'social',
    label: '社区内容',
    appName: '灵感社区',
    palette: 'violet',
    prompt:
      '做一个兴趣社区 App，需要信息流、发布动态、评论点赞、话题圈子、私信消息、活动报名和个人主页。',
  },
  {
    id: 'enterprise',
    label: '企业工具',
    appName: '任务中台',
    palette: 'ocean',
    prompt:
      '做一个企业任务管理 App，需要数据看板、工单流转、任务提醒、审批记录、成员协作、日报周报和权限控制。',
  },
]

const CATEGORY_KEYWORDS: Array<{ category: AppCategory; patterns: RegExp[] }> = [
  {
    category: 'commerce',
    patterns: [/商品/u, /商城/u, /购物车/u, /订单/u, /支付/u, /优惠券/u, /直播带货/u, /主播/u],
  },
  {
    category: 'social',
    patterns: [/社区/u, /动态/u, /评论/u, /点赞/u, /私信/u, /圈子/u, /内容/u],
  },
  {
    category: 'booking',
    patterns: [/预约/u, /门店/u, /到店/u, /服务/u, /排队/u, /时间段/u],
  },
  {
    category: 'education',
    patterns: [/课程/u, /学习/u, /题库/u, /考试/u, /训练营/u, /知识/u],
  },
  {
    category: 'fitness',
    patterns: [/健康/u, /运动/u, /训练/u, /打卡/u, /饮食/u, /体重/u],
  },
  {
    category: 'finance',
    patterns: [/账单/u, /钱包/u, /资产/u, /理财/u, /支付/u, /收支/u],
  },
  {
    category: 'enterprise',
    patterns: [/审批/u, /任务/u, /工单/u, /中台/u, /管理/u, /权限/u, /报表/u],
  },
]

const FEATURE_MAPPINGS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /登录|注册|账号/u, label: '账号登录与身份体系' },
  { pattern: /直播|主播/u, label: '直播间与主播内容' },
  { pattern: /主播搜索|找主播|主播/u, label: '主播搜索与关注' },
  { pattern: /首页|推荐|发现/u, label: '首页内容推荐' },
  { pattern: /搜索/u, label: '关键词搜索' },
  { pattern: /商品详情|详情/u, label: '详情页展示' },
  { pattern: /购物车/u, label: '购物车流程' },
  { pattern: /订单|预约记录/u, label: '订单与记录管理' },
  { pattern: /物流|配送/u, label: '物流与履约跟踪' },
  { pattern: /支付/u, label: '支付闭环' },
  { pattern: /优惠券|会员/u, label: '会员与权益体系' },
  { pattern: /评论|评价/u, label: '评论与反馈' },
  { pattern: /消息|提醒|通知/u, label: '消息提醒中心' },
  { pattern: /私信|聊天/u, label: '即时沟通能力' },
  { pattern: /数据|看板|报表/u, label: '数据看板' },
  { pattern: /工单|任务/u, label: '任务流转' },
  { pattern: /审批/u, label: '审批流程' },
  { pattern: /课程|学习/u, label: '课程与学习路径' },
  { pattern: /打卡|签到/u, label: '打卡与成长激励' },
  { pattern: /客服/u, label: '客服协助入口' },
  { pattern: /活动/u, label: '活动运营模块' },
  { pattern: /个人主页|个人中心|我的/u, label: '个人中心' },
]

const CATEGORY_COPY: Record<AppCategory, CategoryCopy> = {
  commerce: {
    name: '商城',
    summary: '面向消费用户的转化型应用，强调推荐、搜索、下单与复购。',
    audience: '年轻消费用户',
    valueProp: '缩短从浏览到下单的链路',
    monetization: '商品成交、会员增购、活动转化',
    defaults: [
      '首页活动运营位',
      '商品分类导航',
      '收藏与最近浏览',
      '购物车结算',
      '订单物流进度',
      '会员权益页',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '核心曝光位',
        heroTitle: '今日主推与个性化推荐',
        metricLabel: '预估转化',
        sectionA: '首页模块',
        sectionB: '购买动线',
        sectionADefaults: ['轮播 Banner', '热销榜单', '专题活动'],
        sectionBDefaults: ['搜索入口', '购物车快捷入口', '优惠券提醒'],
      },
      {
        id: 'explore',
        name: '商品',
        subtitle: '浏览与决策',
        heroTitle: '商品详情与核心卖点',
        metricLabel: '浏览深度',
        sectionA: '详情结构',
        sectionB: '转化设计',
        sectionADefaults: ['规格参数', '用户评价', '相关推荐'],
        sectionBDefaults: ['立即购买按钮', '售后说明', '库存状态'],
      },
      {
        id: 'orders',
        name: '订单',
        subtitle: '交易闭环',
        heroTitle: '订单管理与服务节点',
        metricLabel: '履约体验',
        sectionA: '订单能力',
        sectionB: '售后支持',
        sectionADefaults: ['订单列表', '物流进度', '支付状态'],
        sectionBDefaults: ['退款售后', '联系客服', '发票记录'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '用户沉淀',
        heroTitle: '会员资产与偏好管理',
        metricLabel: '复购潜力',
        sectionA: '会员体系',
        sectionB: '个人配置',
        sectionADefaults: ['积分权益', '优惠券仓库', '成长等级'],
        sectionBDefaults: ['收货地址', '消息中心', '设置项'],
      },
    ],
  },
  social: {
    name: '社区',
    summary: '以内容增长和互动活跃为核心，关注信息流、互动与社交沉淀。',
    audience: '兴趣内容用户',
    valueProp: '让内容生产、分发和互动形成闭环',
    monetization: '会员订阅、内容活动、品牌合作',
    defaults: [
      '信息流推荐',
      '话题挑战页',
      '互动评论区',
      '私信消息中心',
      '活动报名入口',
      '个人主页编辑',
    ],
    screens: [
      {
        id: 'feed',
        name: '发现',
        subtitle: '内容分发',
        heroTitle: '推荐信息流与兴趣订阅',
        metricLabel: '活跃度',
        sectionA: '推荐机制',
        sectionB: '互动组件',
        sectionADefaults: ['关注流', '推荐流', '热门话题'],
        sectionBDefaults: ['点赞评论', '分享收藏', '快速发布'],
      },
      {
        id: 'detail',
        name: '动态',
        subtitle: '内容承载',
        heroTitle: '图文 / 短视频详情页',
        metricLabel: '停留时长',
        sectionA: '内容结构',
        sectionB: '增长设计',
        sectionADefaults: ['作者信息', '相关推荐', '评论楼层'],
        sectionBDefaults: ['活动引导', '打卡任务', '关注提醒'],
      },
      {
        id: 'message',
        name: '消息',
        subtitle: '关系链',
        heroTitle: '私信与系统通知中心',
        metricLabel: '回复效率',
        sectionA: '消息模块',
        sectionB: '触达策略',
        sectionADefaults: ['私信会话', '评论通知', '系统消息'],
        sectionBDefaults: ['未读提醒', '消息筛选', '消息设置'],
      },
      {
        id: 'profile',
        name: '主页',
        subtitle: '个人品牌',
        heroTitle: '个人主页与创作资产',
        metricLabel: '粉丝沉淀',
        sectionA: '创作资产',
        sectionB: '个人配置',
        sectionADefaults: ['作品列表', '数据概览', '粉丝互动'],
        sectionBDefaults: ['编辑资料', '隐私设置', '成长权益'],
      },
    ],
  },
  booking: {
    name: '预约',
    summary: '围绕时间与服务资源编排，适合到店、咨询、医疗、美业等业务。',
    audience: '需要预约服务的用户',
    valueProp: '减少人工沟通，提升到店与履约效率',
    monetization: '预约成交、增值套餐、复购提醒',
    defaults: [
      '服务项目列表',
      '时间段预约',
      '门店选择',
      '在线支付',
      '到店提醒',
      '评价反馈',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '服务入口',
        heroTitle: '门店与服务项目推荐',
        metricLabel: '预约转化',
        sectionA: '服务入口',
        sectionB: '预约前置',
        sectionADefaults: ['服务分类', '门店卡片', '活动套餐'],
        sectionBDefaults: ['搜索筛选', '时间查看', '客服咨询'],
      },
      {
        id: 'booking',
        name: '预约',
        subtitle: '核心流程',
        heroTitle: '选择门店、人员与时间段',
        metricLabel: '完成率',
        sectionA: '预约步骤',
        sectionB: '确认信息',
        sectionADefaults: ['日期选择', '时间段选择', '服务确认'],
        sectionBDefaults: ['支付定金', '预约备注', '改期规则'],
      },
      {
        id: 'record',
        name: '记录',
        subtitle: '履约跟踪',
        heroTitle: '预约记录与到店提醒',
        metricLabel: '准时率',
        sectionA: '记录管理',
        sectionB: '售后服务',
        sectionADefaults: ['预约列表', '状态变更', '提醒通知'],
        sectionBDefaults: ['在线改期', '退款申请', '服务评价'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '偏好沉淀',
        heroTitle: '常用门店与个人资料',
        metricLabel: '复购预期',
        sectionA: '个人资产',
        sectionB: '设置管理',
        sectionADefaults: ['收藏门店', '优惠权益', '发票信息'],
        sectionBDefaults: ['账号资料', '通知设置', '帮助中心'],
      },
    ],
  },
  education: {
    name: '学习',
    summary: '强调课程结构、学习路径和进度反馈，适合教育训练类产品。',
    audience: '学习提升用户',
    valueProp: '让学习计划、课程内容与练习反馈形成闭环',
    monetization: '课程付费、会员订阅、训练营服务',
    defaults: [
      '课程目录',
      '学习进度',
      '练习与题库',
      '成绩反馈',
      '打卡任务',
      '个人成长档案',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '学习入口',
        heroTitle: '学习计划与重点推荐',
        metricLabel: '开课率',
        sectionA: '推荐内容',
        sectionB: '学习入口',
        sectionADefaults: ['课程推荐', '训练营入口', '阶段测评'],
        sectionBDefaults: ['搜索课程', '学习日历', '学习提醒'],
      },
      {
        id: 'course',
        name: '课程',
        subtitle: '内容承载',
        heroTitle: '课程详情与学习进度',
        metricLabel: '完课率',
        sectionA: '课程结构',
        sectionB: '学习辅助',
        sectionADefaults: ['章节目录', '讲师介绍', '资料下载'],
        sectionBDefaults: ['课后作业', '笔记收藏', '答疑入口'],
      },
      {
        id: 'practice',
        name: '练习',
        subtitle: '巩固反馈',
        heroTitle: '题库练习与能力评估',
        metricLabel: '正确率',
        sectionA: '练习模块',
        sectionB: '反馈机制',
        sectionADefaults: ['章节练习', '模拟测试', '错题本'],
        sectionBDefaults: ['成绩分析', '学习建议', '打卡奖励'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '成长档案',
        heroTitle: '个人资料与成长路径',
        metricLabel: '留存预期',
        sectionA: '成长资产',
        sectionB: '账号设置',
        sectionADefaults: ['学习里程碑', '证书记录', '会员权益'],
        sectionBDefaults: ['资料设置', '消息提醒', '客服支持'],
      },
    ],
  },
  fitness: {
    name: '健康',
    summary: '适合运动、饮食、健康管理场景，突出计划执行与数据沉淀。',
    audience: '关注健康管理的用户',
    valueProp: '让目标、打卡、反馈和习惯养成一体化',
    monetization: '会员订阅、训练计划、周边服务',
    defaults: [
      '训练计划',
      '每日打卡',
      '饮食记录',
      '身体数据趋势',
      '教练服务',
      '个人目标管理',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '计划入口',
        heroTitle: '每日目标与任务推荐',
        metricLabel: '执行率',
        sectionA: '目标面板',
        sectionB: '快捷入口',
        sectionADefaults: ['今日计划', '目标进度', '提醒事项'],
        sectionBDefaults: ['快速打卡', '训练开始', '饮食记录'],
      },
      {
        id: 'plan',
        name: '训练',
        subtitle: '核心计划',
        heroTitle: '训练动作与日程安排',
        metricLabel: '完成度',
        sectionA: '训练内容',
        sectionB: '辅助能力',
        sectionADefaults: ['动作列表', '组数时长', '注意事项'],
        sectionBDefaults: ['语音提醒', '心率同步', '强度建议'],
      },
      {
        id: 'data',
        name: '数据',
        subtitle: '结果反馈',
        heroTitle: '体重、围度与连续打卡',
        metricLabel: '坚持天数',
        sectionA: '趋势看板',
        sectionB: '成长激励',
        sectionADefaults: ['体重趋势', '训练日历', '睡眠概览'],
        sectionBDefaults: ['徽章成就', '阶段总结', '个性化建议'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '个人配置',
        heroTitle: '目标偏好与会员权益',
        metricLabel: '复用可能',
        sectionA: '个人目标',
        sectionB: '账户设置',
        sectionADefaults: ['目标设定', '会员服务', '设备绑定'],
        sectionBDefaults: ['资料设置', '消息提醒', '帮助支持'],
      },
    ],
  },
  finance: {
    name: '钱包',
    summary: '围绕资金记录与资产概览，适合理财、账本、支付助手类产品。',
    audience: '关注收支与资产管理的用户',
    valueProp: '统一记录交易、预算、账单与资产变化',
    monetization: '会员订阅、数据服务、增值工具',
    defaults: [
      '资产概览',
      '账单记录',
      '预算提醒',
      '分类统计',
      '消息通知',
      '安全中心',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '总览面板',
        heroTitle: '账户资产与预算提醒',
        metricLabel: '资金洞察',
        sectionA: '总览模块',
        sectionB: '快捷能力',
        sectionADefaults: ['净资产', '预算进度', '收支趋势'],
        sectionBDefaults: ['快速记账', '账单导入', '账单提醒'],
      },
      {
        id: 'ledger',
        name: '账单',
        subtitle: '交易流水',
        heroTitle: '账单明细与分类管理',
        metricLabel: '记录完整度',
        sectionA: '账单管理',
        sectionB: '辅助分析',
        sectionADefaults: ['流水列表', '分类标签', '筛选检索'],
        sectionBDefaults: ['月度报表', '消费提醒', '预算分析'],
      },
      {
        id: 'data',
        name: '分析',
        subtitle: '趋势反馈',
        heroTitle: '收支图表与财务建议',
        metricLabel: '数据覆盖',
        sectionA: '分析维度',
        sectionB: '风险提示',
        sectionADefaults: ['周月趋势', '分类排行', '资产分布'],
        sectionBDefaults: ['预算超支', '账单异常', '目标储蓄'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '账户安全',
        heroTitle: '账户资料与安全中心',
        metricLabel: '安全等级',
        sectionA: '个人账户',
        sectionB: '安全能力',
        sectionADefaults: ['资料设置', '会员权益', '设备管理'],
        sectionBDefaults: ['隐私权限', '消息提醒', '登录保护'],
      },
    ],
  },
  enterprise: {
    name: '中台',
    summary: '适合任务、审批、工单、SaaS 工具等后台业务流程型产品。',
    audience: '企业团队与管理员',
    valueProp: '统一任务流转、数据沉淀和团队协作路径',
    monetization: '企业订阅、席位收费、增值模块',
    defaults: [
      '任务看板',
      '工单流转',
      '审批流程',
      '成员协作',
      '消息提醒',
      '权限控制',
    ],
    screens: [
      {
        id: 'dashboard',
        name: '看板',
        subtitle: '经营总览',
        heroTitle: '关键业务指标与待办提醒',
        metricLabel: '协作效率',
        sectionA: '看板模块',
        sectionB: '待办入口',
        sectionADefaults: ['关键指标', '异常提醒', '团队概览'],
        sectionBDefaults: ['我的待办', '审批入口', '快捷发起'],
      },
      {
        id: 'task',
        name: '任务',
        subtitle: '流程流转',
        heroTitle: '任务 / 工单状态推进',
        metricLabel: '处理时效',
        sectionA: '任务能力',
        sectionB: '协作机制',
        sectionADefaults: ['任务列表', '筛选视图', '优先级标记'],
        sectionBDefaults: ['成员协同', '评论记录', '状态流转'],
      },
      {
        id: 'analytics',
        name: '数据',
        subtitle: '结果复盘',
        heroTitle: '报表分析与效率追踪',
        metricLabel: '数据覆盖',
        sectionA: '分析维度',
        sectionB: '管理策略',
        sectionADefaults: ['时效报表', '团队产出', '漏斗分析'],
        sectionBDefaults: ['流程诊断', '提醒规则', 'SLA 追踪'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '个人设置',
        heroTitle: '成员权限与个人偏好',
        metricLabel: '配置完成度',
        sectionA: '个人中心',
        sectionB: '管理设置',
        sectionADefaults: ['个人资料', '消息偏好', '常用筛选'],
        sectionBDefaults: ['角色权限', '团队配置', '帮助文档'],
      },
    ],
  },
  generic: {
    name: '助手',
    summary: '通用型产品方案，适合早期 MVP 验证和多功能服务平台。',
    audience: '通用移动用户',
    valueProp: '先搭出核心流程，再逐步扩展业务深度',
    monetization: '会员订阅、增值功能、交易服务',
    defaults: [
      '首页入口',
      '搜索与筛选',
      '核心流程页',
      '数据反馈',
      '消息提醒',
      '个人中心',
    ],
    screens: [
      {
        id: 'home',
        name: '首页',
        subtitle: '总入口',
        heroTitle: '首页推荐与快捷入口',
        metricLabel: '首次转化',
        sectionA: '推荐模块',
        sectionB: '用户入口',
        sectionADefaults: ['轮播信息', '精选模块', '运营位'],
        sectionBDefaults: ['搜索入口', '消息提醒', '快捷操作'],
      },
      {
        id: 'flow',
        name: '流程',
        subtitle: '业务闭环',
        heroTitle: '核心业务流程与状态推进',
        metricLabel: '完成率',
        sectionA: '流程节点',
        sectionB: '辅助能力',
        sectionADefaults: ['列表视图', '详情页', '状态进度'],
        sectionBDefaults: ['筛选条件', '提醒动作', '客服入口'],
      },
      {
        id: 'data',
        name: '数据',
        subtitle: '结果反馈',
        heroTitle: '关键数据与趋势反馈',
        metricLabel: '数据完整度',
        sectionA: '数据面板',
        sectionB: '优化建议',
        sectionADefaults: ['统计卡片', '趋势图表', '活跃概览'],
        sectionBDefaults: ['运营建议', '行为分析', '提醒策略'],
      },
      {
        id: 'profile',
        name: '我的',
        subtitle: '用户沉淀',
        heroTitle: '账户资料与设置中心',
        metricLabel: '留存潜力',
        sectionA: '个人资产',
        sectionB: '系统设置',
        sectionADefaults: ['个人资料', '权益记录', '消息中心'],
        sectionBDefaults: ['隐私设置', '帮助反馈', '关于产品'],
      },
    ],
  },
}

export function generateAppSpec(form: GeneratorFormData): GeneratedApp {
  const prompt = form.prompt.trim()
  const category = inferCategory(prompt)
  const categoryCopy = CATEGORY_COPY[category]
  const palette = getPalette(form.palette)
  const features = extractFeatures(prompt, categoryCopy.defaults)
  const name = deriveAppName(form.appName, prompt, categoryCopy.name)
  const slug = createSlug(name)
  const localModule = buildLocalModule(category, name, features)
  const screenBlueprints = createDemandScreenBlueprints(category, categoryCopy.screens, features, prompt)
  const screens = screenBlueprints.map((screen, index) =>
    buildScreen(screen, features, index),
  )
  const platformLabel = PLATFORM_LABELS[form.platform]
  const highlights = [
    `${features.length} 个核心模块`,
    `${screens.length} 张关键界面`,
    localModule.title,
    '本地数据直接可用',
  ]

  return {
    name,
    slug,
    prompt,
    category,
    summary: categoryCopy.summary,
    audience: categoryCopy.audience,
    valueProp: categoryCopy.valueProp,
    monetization: categoryCopy.monetization,
    platform: form.platform,
    platformLabel,
    palette,
    features,
    screens,
    highlights,
    localModule,
    packageContents: [
      '安卓 App 页面骨架与多屏预览',
      `本地功能模块：${localModule.title}`,
      'localStorage 持久化：关闭后再次打开仍保留数据',
      'PWA 文件：manifest、service worker、离线缓存',
    ],
    buildSteps: [
      '输入需求并生成预览，确认页面结构和本地功能模块。',
      '生成正式版 APK，直接安装到安卓手机。',
      '打开 App 后即可直接使用本地功能。',
      '如需联网能力，再继续接入正式接口。',
    ],
    installNote:
      `当前生成的 App 打开后自带“${localModule.title}”，数据仅保存在当前设备，本地即可使用。`,
  }
}

export async function buildPwaPackage(spec: GeneratedApp): Promise<Blob> {
  const zip = new JSZip()
  const folder = zip.folder(spec.slug)

  if (!folder) {
    throw new Error('Failed to create package folder.')
  }

  folder.file('index.html', createHtml(spec))
  folder.file('styles.css', createStyles(spec))
  folder.file('app.js', createClientScript(spec))
  folder.file('manifest.webmanifest', createManifest(spec))
  folder.file('service-worker.js', createServiceWorker(spec))
  folder.file('preview-data.json', JSON.stringify(spec, null, 2))
  folder.file('README.md', createReadme(spec))
  folder.file('native-handoff.md', createNativeHandoff(spec))
  folder.file('icons/icon-192.svg', createIconSvg(spec, 192))
  folder.file('icons/icon-512.svg', createIconSvg(spec, 512))

  return zip.generateAsync({ type: 'blob' })
}

export async function buildExpoPackage(spec: GeneratedApp): Promise<Blob> {
  const zip = new JSZip()
  const folder = zip.folder(`${spec.slug}-expo`)

  if (!folder) {
    throw new Error('Failed to create Expo package folder.')
  }

  folder.file('package.json', createExpoPackageJson(spec))
  folder.file('app.json', createExpoAppConfig(spec))
  folder.file('App.js', createExpoAppSource(spec))
  folder.file('eas.json', createEasConfig())
  folder.file('.gitignore', createExpoGitignore())
  folder.file('README.md', createExpoReadme(spec))
  folder.file('preview-data.json', JSON.stringify(spec, null, 2))

  return zip.generateAsync({ type: 'blob' })
}

const PLATFORM_LABELS: Record<Platform, string> = {
  dual: '双端通用',
  android: 'Android 优先',
  ios: 'iOS 优先',
}

function buildLocalModule(
  category: AppCategory,
  appName: string,
  features: string[],
): LocalModuleSpec {
  const featureLead = features[0] ?? '核心模块'

  switch (category) {
    case 'commerce':
      return {
        kind: 'catalog',
        title: '商品搜索 + 收藏 + 购物车',
        description:
          '打开后即可搜索商品、收藏商品、加入购物车，所有内容都只保存在本机。',
        primaryAction: '加入购物车',
        secondaryAction: '收藏',
        emptyState: '没有找到匹配商品',
        tips: ['支持关键词搜索', '支持收藏和购物车', '刷新后本地数据仍保留'],
        sampleItems: [
          createLocalItem('new', '今日上新套装', featureLead, '¥129', '推荐', 129),
          createLocalItem('hot', '热门精选单品', '可加入购物车或收藏', '¥89', '热卖', 89),
          createLocalItem('coupon', '会员专属福袋', '适合做活动展示', '¥59', '限时', 59),
        ],
      }
    case 'booking':
      return {
        kind: 'schedule',
        title: '时段选择 + 本地预约记录',
        description:
          '用户可以直接在 App 里选择时段并生成本地预约记录，不需要后台也能演示流程。',
        primaryAction: '立即预约',
        emptyState: '没有可用时段',
        tips: ['点击时段即可预约', '预约记录自动保存在本机', '适合门店、咨询、服务预约'],
        sampleItems: [
          createLocalItem('slot-1', '门店咨询', '今天 18:30', `虹桥门店 · ${featureLead}`, '可约'),
          createLocalItem('slot-2', '护理体验', '今天 20:00', '静安门店', '热门'),
          createLocalItem('slot-3', '复诊回访', '明天 10:30', '远程视频', '推荐'),
        ],
      }
    case 'social':
      return {
        kind: 'feed',
        title: '动态点赞 + 收藏 + 草稿发布',
        description:
          'App 自带本地信息流，可点赞、收藏，并新增一条草稿动态演示发布感。',
        primaryAction: '点赞',
        secondaryAction: '收藏',
        quickAddPlaceholder: '写一条想展示的动态',
        emptyState: '没有符合条件的动态',
        tips: ['支持点赞和收藏', '支持新增本地草稿', '适合社区和内容型演示'],
        sampleItems: [
          createLocalItem('post-1', '通勤穿搭清单', '今日热门内容卡片', '阅读 128', '推荐'),
          createLocalItem('post-2', '门店开箱体验', '支持收藏和点赞演示', '阅读 95', '精选'),
          createLocalItem('post-3', '周末活动报名', '可模拟互动氛围', '阅读 66', '活动'),
        ],
      }
    case 'education':
      return {
        kind: 'checklist',
        title: '课程清单 + 学习进度',
        description:
          '打开后可以勾选完成课程任务，并记录当前学习进度，适合培训或课程演示。',
        primaryAction: '标记完成',
        quickAddPlaceholder: '新增一个学习任务',
        emptyState: '没有匹配的学习任务',
        tips: ['支持勾选完成状态', '支持新增本地学习任务', '进度自动保存在本机'],
        sampleItems: [
          createLocalItem('lesson-1', '课程导览', '了解产品结构', '8 分钟', '入门'),
          createLocalItem('lesson-2', '重点章节', '演示学习卡片样式', '15 分钟', '核心'),
          createLocalItem('lesson-3', '课后练习', '完成后可显示进度', '12 分钟', '练习'),
        ],
      }
    case 'fitness':
      return {
        kind: 'tracker',
        title: '每日打卡 + 习惯追踪',
        description:
          '用户可在 App 里直接完成打卡，适合运动、健康、习惯养成类演示。',
        primaryAction: '今日打卡',
        quickAddPlaceholder: '新增一个打卡项目',
        emptyState: '没有匹配的打卡项目',
        tips: ['支持一键打卡', '支持新增习惯项', '连续打开依然保留本地记录'],
        sampleItems: [
          createLocalItem('habit-1', '早起喝水', '每日固定动作', '08:00', '习惯'),
          createLocalItem('habit-2', '晚间散步', '演示健康打卡', '20 分钟', '推荐'),
          createLocalItem('habit-3', '拉伸训练', '支持连续完成感', '10 分钟', '训练'),
        ],
      }
    case 'finance':
      return {
        kind: 'ledger',
        title: '本地记账 + 汇总统计',
        description:
          '可直接新增本地账单并自动汇总金额，不接后端也能展示基础财务功能。',
        primaryAction: '删除记录',
        quickAddPlaceholder: '例如：午餐 28',
        emptyState: '暂无账单记录',
        tips: ['输入“名称 金额”即可记账', '自动汇总本地金额', '适合钱包、收支、预算演示'],
        sampleItems: [
          createLocalItem('bill-1', '早餐', '今日消费', '¥18', '饮食', 18),
          createLocalItem('bill-2', '打车', '上下班通勤', '¥32', '出行', 32),
          createLocalItem('bill-3', '咖啡', '下午补给', '¥24', '日常', 24),
        ],
      }
    case 'enterprise':
      return {
        kind: 'tasks',
        title: '待办清单 + 完成状态',
        description:
          '可在 App 中新增待办、标记完成，适合中台、工单、任务协作类产品演示。',
        primaryAction: '完成',
        quickAddPlaceholder: '新增一个任务',
        emptyState: '没有匹配的任务',
        tips: ['支持新增待办', '支持完成状态切换', '适合企业工具演示'],
        sampleItems: [
          createLocalItem('task-1', '整理今日工单', '处理待办列表', '高优先级', '待办'),
          createLocalItem('task-2', '确认审批意见', '演示流程型任务', '本日截止', '审批'),
          createLocalItem('task-3', '同步数据概览', '适合后台 App 展示', '15:00 前', '看板'),
        ],
      }
    default:
      return {
        kind: 'notes',
        title: '本地便签 + 重点记录',
        description:
          '默认提供本地便签功能，打开后就能写内容并保存在浏览器里，适合通用演示。',
        primaryAction: '删除',
        quickAddPlaceholder: `记录一个关于 ${appName} 的重点`,
        emptyState: '还没有内容，先写一条吧',
        tips: ['支持新增便签', '支持删除便签', '所有内容只保存在当前浏览器'],
        sampleItems: [
          createLocalItem('note-1', `${appName} 首页`, '展示核心入口布局', '本地便签', '结构'),
          createLocalItem('note-2', `${appName} 流程`, '适合记录演示步骤', '本地便签', '流程'),
          createLocalItem('note-3', `${appName} 亮点`, '突出卖点与重点功能', '本地便签', '重点'),
        ],
      }
  }
}

function createLocalItem(
  id: string,
  title: string,
  subtitle: string,
  meta: string,
  badge: string,
  value?: number,
): LocalModuleItem {
  return { id, title, subtitle, meta, badge, value }
}

function buildScreen(
  screen: ScreenBlueprint,
  features: string[],
  index: number,
): ScreenPreview {
  const primaryItems = pickItems(
    features,
    screen.sectionADefaults,
    index * 2,
    3,
  )
  const secondaryItems = pickItems(
    features,
    screen.sectionBDefaults,
    index * 2 + 1,
    3,
  )
  const metricSeed = 62 + ((features.length + 3) * 7 + index * 9) % 29

  return {
    id: screen.id,
    name: screen.name,
    subtitle: screen.subtitle,
    heroTitle: screen.heroTitle,
    metricLabel: screen.metricLabel,
    metricValue: `${metricSeed}%`,
    chips: pickItems(features, [...screen.sectionADefaults, ...screen.sectionBDefaults], index, 3),
    sections: [
      {
        title: screen.sectionA,
        caption: '自动提炼自需求',
        items: primaryItems,
      },
      {
        title: screen.sectionB,
        caption: '适合 MVP 的补全建议',
        items: secondaryItems,
      },
    ],
  }
}

function createDemandScreenBlueprints(
  category: AppCategory,
  baseScreens: ScreenBlueprint[],
  features: string[],
  prompt: string,
): ScreenBlueprint[] {
  if (/直播|主播/u.test(prompt)) {
    return createLiveCommerceScreens(features)
  }

  if (/短视频|视频|图文|内容流/u.test(prompt) && category === 'social') {
    return createContentScreens(features)
  }

  if (/教练|私教|课程预约|到店签到/u.test(prompt)) {
    return createCoachBookingScreens(features)
  }

  return personalizeBaseScreens(baseScreens, features)
}

function createLiveCommerceScreens(features: string[]): ScreenBlueprint[] {
  return [
    {
      id: 'live',
      name: '直播',
      subtitle: '实时带货',
      heroTitle: '直播间推荐与主播讲解',
      metricLabel: '观看转化',
      sectionA: '直播内容',
      sectionB: '互动转化',
      sectionADefaults: ['主播推荐', '直播间列表', '实时讲解'],
      sectionBDefaults: ['讲解商品', '弹幕互动', '关注主播'],
    },
    {
      id: 'host',
      name: '主播',
      subtitle: '达人发现',
      heroTitle: '主播搜索与关注管理',
      metricLabel: '关注率',
      sectionA: '主播搜索',
      sectionB: '主播主页',
      sectionADefaults: ['主播关键词', '人气筛选', '直播预告'],
      sectionBDefaults: ['主播档案', '历史直播', '粉丝互动'],
    },
    {
      id: 'product',
      name: '商品',
      subtitle: '转化决策',
      heroTitle: '商品详情与直播同款',
      metricLabel: '加购率',
      sectionA: '商品信息',
      sectionB: '购买决策',
      sectionADefaults: ['规格价格', '直播优惠', '用户评价'],
      sectionBDefaults: ['立即购买', '加入购物车', '相似推荐'],
    },
    {
      id: 'cart',
      name: '购物车',
      subtitle: '下单前置',
      heroTitle: '购物车与优惠结算',
      metricLabel: '结算率',
      sectionA: '购物车列表',
      sectionB: '优惠策略',
      sectionADefaults: ['已选商品', '数量调整', '失效提醒'],
      sectionBDefaults: ['优惠券', '满减凑单', '结算确认'],
    },
    {
      id: 'orders',
      name: '订单',
      subtitle: '履约服务',
      heroTitle: '订单记录与物流跟踪',
      metricLabel: '履约率',
      sectionA: '订单管理',
      sectionB: '售后服务',
      sectionADefaults: ['订单列表', '支付状态', '物流节点'],
      sectionBDefaults: ['退款售后', '客服咨询', '再次购买'],
    },
    {
      id: 'profile',
      name: '我的',
      subtitle: '会员沉淀',
      heroTitle: '会员中心与消息提醒',
      metricLabel: '复购率',
      sectionA: '会员资产',
      sectionB: '消息配置',
      sectionADefaults: ['会员等级', '优惠券包', '收藏主播'],
      sectionBDefaults: ['开播提醒', '订单通知', '账号设置'],
    },
  ].map((screen, index) => enrichScreenWithFeatures(screen, features, index))
}

function createContentScreens(features: string[]): ScreenBlueprint[] {
  return [
    {
      id: 'feed',
      name: '推荐',
      subtitle: '内容分发',
      heroTitle: '推荐信息流与兴趣订阅',
      metricLabel: '停留时长',
      sectionA: '信息流',
      sectionB: '互动组件',
      sectionADefaults: ['关注流', '推荐流', '热门话题'],
      sectionBDefaults: ['点赞评论', '分享收藏', '快速发布'],
    },
    {
      id: 'publish',
      name: '发布',
      subtitle: '创作入口',
      heroTitle: '图文 / 视频发布工作台',
      metricLabel: '发布率',
      sectionA: '内容编辑',
      sectionB: '运营增强',
      sectionADefaults: ['标题正文', '图片视频', '标签话题'],
      sectionBDefaults: ['草稿箱', '定时发布', '数据反馈'],
    },
    {
      id: 'message',
      name: '消息',
      subtitle: '关系维护',
      heroTitle: '评论、点赞与私信中心',
      metricLabel: '回复率',
      sectionA: '互动通知',
      sectionB: '私信关系',
      sectionADefaults: ['点赞提醒', '评论回复', '系统通知'],
      sectionBDefaults: ['私信会话', '关注列表', '黑名单'],
    },
    {
      id: 'profile',
      name: '主页',
      subtitle: '个人资产',
      heroTitle: '作品主页与粉丝资产',
      metricLabel: '沉淀率',
      sectionA: '作品资产',
      sectionB: '个人设置',
      sectionADefaults: ['作品列表', '数据概览', '粉丝互动'],
      sectionBDefaults: ['编辑资料', '隐私设置', '成长权益'],
    },
  ].map((screen, index) => enrichScreenWithFeatures(screen, features, index))
}

function createCoachBookingScreens(features: string[]): ScreenBlueprint[] {
  return [
    {
      id: 'coach',
      name: '教练',
      subtitle: '服务选择',
      heroTitle: '教练列表与专长筛选',
      metricLabel: '咨询率',
      sectionA: '教练档案',
      sectionB: '筛选推荐',
      sectionADefaults: ['教练照片', '擅长课程', '用户评价'],
      sectionBDefaults: ['按时间筛选', '按门店筛选', '按评分排序'],
    },
    {
      id: 'course',
      name: '课程',
      subtitle: '预约决策',
      heroTitle: '课程预约与时间选择',
      metricLabel: '预约率',
      sectionA: '课程内容',
      sectionB: '预约步骤',
      sectionADefaults: ['课程介绍', '训练目标', '适合人群'],
      sectionBDefaults: ['日期选择', '时段选择', '门店确认'],
    },
    {
      id: 'checkin',
      name: '签到',
      subtitle: '到店履约',
      heroTitle: '到店签到与训练记录',
      metricLabel: '到店率',
      sectionA: '签到流程',
      sectionB: '训练沉淀',
      sectionADefaults: ['扫码签到', '到店提醒', '教练确认'],
      sectionBDefaults: ['训练记录', '身体数据', '阶段反馈'],
    },
    {
      id: 'member',
      name: '会员',
      subtitle: '复购资产',
      heroTitle: '会员卡与权益管理',
      metricLabel: '续费率',
      sectionA: '会员资产',
      sectionB: '消息提醒',
      sectionADefaults: ['会员卡', '剩余课时', '优惠权益'],
      sectionBDefaults: ['上课提醒', '续费提醒', '活动通知'],
    },
  ].map((screen, index) => enrichScreenWithFeatures(screen, features, index))
}

function personalizeBaseScreens(
  baseScreens: ScreenBlueprint[],
  features: string[],
): ScreenBlueprint[] {
  return baseScreens.map((screen, index) => enrichScreenWithFeatures(screen, features, index))
}

function enrichScreenWithFeatures(
  screen: ScreenBlueprint,
  features: string[],
  index: number,
): ScreenBlueprint {
  const primaryFeature = features[index] ?? features[0]
  const secondaryFeature = features[index + 1] ?? features[1]

  if (!primaryFeature || !secondaryFeature) {
    return screen
  }

  return {
    ...screen,
    heroTitle: screen.heroTitle,
    sectionADefaults: uniqueText([primaryFeature, ...screen.sectionADefaults]),
    sectionBDefaults: uniqueText([secondaryFeature, ...screen.sectionBDefaults]),
  }
}

function inferCategory(prompt: string): AppCategory {
  const scores = new Map<AppCategory, number>()
  const normalized = prompt.trim()

  CATEGORY_KEYWORDS.forEach(({ category, patterns }) => {
    const score = patterns.reduce(
      (sum, pattern) => sum + (pattern.test(normalized) ? 1 : 0),
      0,
    )

    if (score > 0) {
      scores.set(category, score)
    }
  })

  let winner: AppCategory = 'generic'
  let highest = 0

  scores.forEach((score, category) => {
    if (score > highest) {
      winner = category
      highest = score
    }
  })

  return winner
}

function extractFeatures(prompt: string, fallbacks: string[]): string[] {
  const tokens = splitPrompt(prompt)
  const features: string[] = []

  const pushFeature = (value: string) => {
    const trimmed = cleanSentence(value)

    if (!trimmed) {
      return
    }

    if (!features.includes(trimmed)) {
      features.push(trimmed)
    }
  }

  FEATURE_MAPPINGS.forEach(({ pattern, label }) => {
    if (pattern.test(prompt)) {
      pushFeature(label)
    }
  })

  tokens.forEach((token) => {
    if (token.length <= 16) {
      pushFeature(token)
      return
    }

    pushFeature(`${token.slice(0, 16)}...`)
  })

  fallbacks.forEach((fallback) => pushFeature(fallback))

  return features.slice(0, 8)
}

function splitPrompt(prompt: string): string[] {
  return prompt
    .replace(/\r/g, '')
    .split(/\n|。|；|;|，|,|、|!|！|\?|？/u)
    .map(cleanSentence)
    .filter(Boolean)
}

function cleanSentence(sentence: string): string {
  return sentence
    .replace(/^[-\d.\s、•]+/u, '')
    .replace(
      /^(做一个|做款|开发一个|设计一个|创建一个|一款|一个|需要|支持|包含|包括|具备|提供|并支持|并且支持)/u,
      '',
    )
    .replace(/\bapp\b/giu, '')
    .replace(/应用$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function deriveAppName(appName: string, prompt: string, categoryName: string): string {
  const direct = appName.trim()

  if (direct) {
    return direct
  }

  const firstToken = splitPrompt(prompt)[0]?.replace(/\s+/g, '') ?? ''
  const base = firstToken.slice(0, 4)

  return base ? `${base}${categoryName}` : `${categoryName}生成器`
}

function createSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const hash = Math.abs(hashString(name)).toString(36).slice(0, 6)

  return ascii ? `${ascii}-${hash}` : `app-${hash}`
}

function hashString(value: string): number {
  let hash = 0

  for (const character of value) {
    hash = (hash << 5) - hash + character.charCodeAt(0)
    hash |= 0
  }

  return hash
}

function pickItems(
  features: string[],
  fallbacks: string[],
  offset: number,
  count: number,
): string[] {
  const source = [...features, ...fallbacks]
  const items: string[] = []

  for (let index = 0; index < source.length && items.length < count; index += 1) {
    const candidate = source[(index + offset) % source.length]

    if (!items.includes(candidate)) {
      items.push(candidate)
    }
  }

  return items
}

function uniqueText(items: string[]): string[] {
  return items.filter((item, index) => item && items.indexOf(item) === index)
}

function getPalette(paletteId: PaletteId): PaletteOption {
  return PALETTE_OPTIONS.find((palette) => palette.id === paletteId) ?? PALETTE_OPTIONS[0]
}

function createHtml(spec: GeneratedApp): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="${spec.palette.accent}" />
    <meta name="description" content="${spec.summary}" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="stylesheet" href="./styles.css" />
    <title>${spec.name}</title>
  </head>
  <body>
    <div class="page" id="app"></div>
    <script src="./app.js"></script>
  </body>
</html>
`
}

function createStyles(spec: GeneratedApp): string {
  return `:root {
  --accent: ${spec.palette.accent};
  --accent-soft: ${spec.palette.accentSoft};
  --accent-strong: ${spec.palette.accentStrong};
  --contrast: ${spec.palette.contrast};
  --surface: ${spec.palette.surface};
  --surface-strong: ${spec.palette.surfaceStrong};
  --bg: #07111f;
  --panel: rgba(255, 255, 255, 0.94);
  --text: #122033;
  --muted: #5f6b7d;
  --line: rgba(18, 32, 51, 0.08);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top right, ${spec.palette.accentSoft} 0%, transparent 35%),
    linear-gradient(160deg, #07111f 0%, #121d33 100%);
  color: var(--text);
}

.page {
  min-height: 100vh;
  padding: 20px 14px 36px;
}

.shell {
  max-width: 1024px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}

.hero {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 18px;
  align-items: stretch;
}

.card {
  background: var(--panel);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 24px 60px rgba(3, 14, 28, 0.28);
}

.badge {
  display: inline-flex;
  padding: 8px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 700;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  margin-top: 14px;
  font-size: clamp(28px, 5vw, 44px);
  line-height: 1.08;
}

.summary {
  margin-top: 12px;
  color: var(--muted);
  font-size: 16px;
  line-height: 1.7;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.pill-row span,
.tag {
  border-radius: 999px;
  background: var(--surface);
  color: var(--accent-strong);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
}

.phone {
  max-width: 360px;
  margin: 0 auto;
  border-radius: 32px;
  padding: 14px;
  background: linear-gradient(180deg, #101827 0%, #18253b 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.36);
}

.phone-screen {
  min-height: 520px;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff 0%, ${spec.palette.surface} 100%);
  padding: 18px;
}

.screen-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.screen-head small,
.caption {
  color: var(--muted);
}

.metric {
  min-width: 84px;
  padding: 12px;
  border-radius: 18px;
  background: var(--accent);
  color: var(--contrast);
  text-align: center;
}

.metric strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
}

ul,
ol {
  margin: 0;
  padding-left: 18px;
}

li + li {
  margin-top: 8px;
}

.grid {
  display: grid;
  gap: 18px;
  grid-template-columns: 1.3fr 0.7fr;
}

.small {
  font-size: 14px;
  color: var(--muted);
}

.screen-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  margin-bottom: 16px;
}

.screen-tabs button {
  border: none;
  border-radius: 999px;
  padding: 10px 14px;
  background: var(--surface);
  color: var(--accent-strong);
  font-weight: 700;
}

.screen-tabs button.active {
  background: var(--accent);
  color: var(--contrast);
}

.local-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.summary-chip {
  display: inline-flex;
  padding: 9px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 700;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.summary-box {
  padding: 14px;
  border-radius: 18px;
  background: var(--surface);
}

.summary-box span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

.summary-box strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
  color: var(--text);
}

.search-row,
.quick-row {
  margin-top: 14px;
}

.search-row input,
.quick-row input {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0 14px;
  font: inherit;
  color: var(--text);
  background: rgba(255, 255, 255, 0.92);
}

.quick-row {
  display: flex;
  gap: 10px;
}

.quick-row button,
.list-actions button,
.screen-tabs button {
  cursor: pointer;
}

.quick-row button,
.list-actions button {
  border: none;
  border-radius: 14px;
  padding: 0 16px;
  font-weight: 700;
}

.quick-row button.primary,
.list-actions button.primary {
  background: var(--accent);
  color: var(--contrast);
}

.list-actions button.secondary {
  background: var(--surface);
  color: var(--accent-strong);
}

.item-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.item-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.88);
}

.item-head,
.item-meta,
.aside-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.item-head strong,
.aside-card strong {
  color: var(--text);
}

.item-head span,
.item-meta span,
.aside-card p,
.empty {
  color: var(--muted);
}

.item-meta {
  margin-top: 8px;
  font-size: 13px;
}

.status {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 700;
}

.list-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.list-actions button {
  min-height: 38px;
}

.aside-card {
  display: grid;
  gap: 14px;
}

.aside-list {
  margin: 0;
  padding-left: 18px;
}

.aside-list li + li {
  margin-top: 10px;
}

@media (max-width: 900px) {
  .hero,
  .grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
`
}

function createClientScript(spec: GeneratedApp): string {
  const payload = JSON.stringify(spec, null, 2)

  return `const spec = ${payload};
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
    const match = value.match(/^(.*?)(\\d+(?:\\.\\d+)?)$/);
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

  app.innerHTML = \`
    <div class="shell">
      <section class="hero">
        <article class="card">
          <span class="badge">安卓 App 本地功能</span>
          <h1>\${spec.name}</h1>
          <p class="summary">\${spec.summary}</p>
          <div class="pill-row">
            \${spec.highlights.map((item) => \`<span>\${item}</span>\`).join('')}
          </div>
        </article>
        <article class="phone">
          <div class="phone-screen">
            <div class="screen-head">
              <div>
                <small>\${activeScreen.subtitle}</small>
                <h3>\${activeScreen.heroTitle}</h3>
              </div>
              <div class="metric">
                <span>\${activeScreen.metricLabel}</span>
                <strong>\${activeScreen.metricValue}</strong>
              </div>
            </div>
            <div class="screen-tabs">
              \${spec.screens
                .map(
                  (screen) => \`<button data-screen-id="\${screen.id}" class="\${screen.id === activeScreenId ? 'active' : ''}">\${screen.name}</button>\`,
                )
                .join('')}
            </div>
            <div class="pill-row">
              \${activeScreen.chips.map((item) => \`<span class="tag">\${item}</span>\`).join('')}
            </div>
            <div class="item-list">
              \${activeScreen.sections
                .map(
                  (section) => \`
                    <div class="item-card">
                      <div class="item-head">
                        <div><strong>\${section.title}</strong><p class="small">\${section.caption}</p></div>
                      </div>
                      <ul>
                        \${section.items.map((item) => \`<li>\${item}</li>\`).join('')}
                      </ul>
                    </div>
                  \`,
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
              <h2>\${localModule.title}</h2>
            </div>
            <span class="summary-chip">无需后端</span>
          </div>
          <p class="summary">\${localModule.description}</p>

          <div class="summary-grid">
            \${summary
              .map(
                (item) => \`<div class="summary-box"><span>\${item.label}</span><strong>\${item.value}</strong></div>\`,
              )
              .join('')}
          </div>

          <div class="search-row">
            <input data-role="search" value="\${state.search}" placeholder="搜索当前内容" />
          </div>

          \${localModule.quickAddPlaceholder
            ? \`<form class="quick-row" data-role="quick-form">
                <input data-role="quick-input" value="\${state.quickInput}" placeholder="\${localModule.quickAddPlaceholder}" />
                <button class="primary" type="submit">添加</button>
              </form>\`
            : ''}

          \${renderLocalList()}
        </article>

        <article class="card">
          \${renderAsideContent()}
        </article>
      </section>
    </div>
  \`;

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
`
}

function createManifest(spec: GeneratedApp): string {
  return JSON.stringify(
    {
      name: spec.name,
      short_name: spec.name.slice(0, 12),
      description: spec.summary,
      start_url: './index.html',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: spec.palette.accent,
      icons: [
        {
          src: './icons/icon-192.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
        },
        {
          src: './icons/icon-512.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
        },
      ],
    },
    null,
    2,
  )
}

function createServiceWorker(spec: GeneratedApp): string {
  return `const CACHE_NAME = '${spec.slug}-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './preview-data.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
`
}

function createReadme(spec: GeneratedApp): string {
  return `# ${spec.name}

这是由需求自动生成的 Web App 项目包。

## 你会得到什么

- 自动生成的多屏页面预览
- 本地可用功能：${spec.localModule.title}
- 可安装的 PWA 配置（manifest + service worker）
- 业务功能配置 JSON

## 如何使用

1. 将整个目录部署到任意支持 HTTPS 的静态托管平台。
2. 用手机浏览器打开页面。
3. 如需 Web 形态运行，可在浏览器菜单中选择“添加到主屏幕”。

## 本地功能说明

- ${spec.localModule.description}
- ${spec.localModule.tips.join('\n- ')}

## 当前业务摘要

- 产品定位：${spec.summary}
- 目标用户：${spec.audience}
- 核心卖点：${spec.valueProp}
- 盈利方式：${spec.monetization}
`
}

function createNativeHandoff(spec: GeneratedApp): string {
  return `# ${spec.name} 原生封装交接说明

当前导出的是 Web App 项目，已经能在安卓浏览器里打开并添加到主屏幕。若你想继续生成 Android App APK，可按下面路径推进：

## 方案一：Capacitor 封装

1. 将当前导出的静态页面部署到正式 HTTPS 域名，或复制到 Capacitor Web 目录。
2. 初始化 Capacitor 项目。
3. 添加 Android 平台。
4. 在 Android Studio 中完成图标、启动页、签名与发布。

## 方案二：Expo / React Native Android App

1. 以当前预览的页面结构与功能点为蓝本创建 Expo 工程。
2. 将 ${spec.features.join('、')} 作为首批开发模块。
3. 保持为静态 App 页面，或按需接入接口能力。
4. 配置 Android 构建签名后导出 APK。

## 生成结果建议

- 预览页面数量：${spec.screens.length}
- 首批核心模块：${spec.features.join('、')}
- 推荐平台策略：${spec.platformLabel}
`
}

function createIconSvg(spec: GeneratedApp, size: number): string {
  const initials = spec.name.replace(/\s+/g, '').slice(0, 2) || 'App'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${spec.palette.accent}"/>
      <stop offset="100%" stop-color="${spec.palette.accentStrong}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="124" fill="url(#bg)"/>
  <rect x="52" y="52" width="408" height="408" rx="96" fill="white" fill-opacity="0.12"/>
  <text x="256" y="290" text-anchor="middle" font-size="168" font-family="Arial, PingFang SC, sans-serif" font-weight="700" fill="white">${initials}</text>
</svg>
`
}

function createExpoPackageJson(spec: GeneratedApp): string {
  return JSON.stringify(
    {
      name: `${spec.slug}-expo`,
      version: '1.0.0',
      private: true,
      main: 'node_modules/expo/AppEntry.js',
      scripts: {
        start: 'expo start',
        android: 'expo run:android',
        web: 'expo start --web',
        'build:android': 'npx eas-cli build -p android --profile production',
      },
      dependencies: {
        expo: '~55.0.0',
        'expo-status-bar': '~55.0.4',
        react: '19.2.0',
        'react-native': '0.83.0',
        'react-native-web': '^0.21.0',
      },
    },
    null,
    2,
  )
}

function createExpoAppConfig(spec: GeneratedApp): string {
  const nativeId = createNativeIdentifier(spec.slug)

  return JSON.stringify(
    {
      expo: {
        name: spec.name,
        slug: `${spec.slug}-expo`,
        version: '1.0.0',
        orientation: 'portrait',
        userInterfaceStyle: 'light',
        platforms: ['android', 'web'],
        scheme: spec.slug,
        android: {
          package: nativeId,
        },
        web: {
          bundler: 'metro',
        },
        extra: {
          generatedBy: 'Make App',
          generatedAt: new Date().toISOString(),
          category: spec.category,
        },
      },
    },
    null,
    2,
  )
}

function createExpoAppSource(spec: GeneratedApp): string {
  const payload = JSON.stringify(spec, null, 2)

  return `import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

const spec = ${payload};

export default function App() {
  const [activeScreenId, setActiveScreenId] = useState(spec.screens[0]?.id ?? 'home');

  const activeScreen = useMemo(() => {
    return spec.screens.find((screen) => screen.id === activeScreenId) ?? spec.screens[0];
  }, [activeScreenId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <View style={styles.heroCard}>
          <Text style={styles.badge}>AI App Generator</Text>
          <Text style={styles.heroTitle}>{spec.name}</Text>
          <Text style={styles.heroSummary}>{spec.summary}</Text>

          <View style={styles.pillRow}>
            {spec.highlights.map((item) => (
              <View key={item} style={styles.pill}>
                <Text style={styles.pillText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <InfoCard label="目标用户" value={spec.audience} />
          <InfoCard label="产品亮点" value={spec.valueProp} />
          <InfoCard label="盈利方式" value={spec.monetization} />
          <InfoCard label="平台策略" value={spec.platformLabel} />
        </View>

        <View style={styles.phoneCard}>
          <View style={styles.phoneTop}>
            <View>
              <Text style={styles.sectionEyebrow}>实时预览</Text>
              <Text style={styles.sectionTitle}>{activeScreen.name}</Text>
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>{activeScreen.metricLabel}</Text>
              <Text style={styles.metricValue}>{activeScreen.metricValue}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {spec.screens.map((screen) => {
              const active = screen.id === activeScreenId;

              return (
                <Pressable
                  key={screen.id}
                  onPress={() => setActiveScreenId(screen.id)}
                  style={[styles.tabButton, active ? styles.tabButtonActive : null]}
                >
                  <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                    {screen.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.screenHero}>
            <Text style={styles.screenEyebrow}>{activeScreen.subtitle}</Text>
            <Text style={styles.screenTitle}>{activeScreen.heroTitle}</Text>
          </View>

          <View style={styles.pillRow}>
            {activeScreen.chips.map((chip) => (
              <View key={chip} style={styles.tag}>
                <Text style={styles.tagText}>{chip}</Text>
              </View>
            ))}
          </View>

          {activeScreen.sections.map((section) => (
            <View key={section.title} style={styles.contentCard}>
              <View style={styles.contentHead}>
                <Text style={styles.contentTitle}>{section.title}</Text>
                <Text style={styles.contentCaption}>{section.caption}</Text>
              </View>

              {section.items.map((item) => (
                <View key={item} style={styles.listItem}>
                  <View style={styles.dot} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>核心模块</Text>
            <Text style={styles.detailCaption}>自动提炼出的 MVP 功能重点</Text>
            <View style={styles.pillRow}>
              {spec.features.map((item) => (
                <View key={item} style={styles.tag}>
                  <Text style={styles.tagText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>打包步骤</Text>
            <Text style={styles.detailCaption}>继续生成安卓安装包</Text>
            {spec.buildSteps.map((item) => (
              <View key={item} style={styles.listItem}>
                <View style={styles.dot} />
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoCard({ label, value }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const palette = {
  accent: '${spec.palette.accent}',
  accentSoft: '${spec.palette.accentSoft}',
  accentStrong: '${spec.palette.accentStrong}',
  contrast: '${spec.palette.contrast}',
  surface: '${spec.palette.surface}',
  surfaceStrong: '${spec.palette.surfaceStrong}',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
    paddingTop: StatusBar.currentHeight ?? 0,
  },
  page: {
    flex: 1,
    backgroundColor: '#020617',
  },
  pageContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.accentSoft,
    color: palette.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  heroTitle: {
    marginTop: 14,
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  heroSummary: {
    marginTop: 12,
    color: '#b8c0d9',
    fontSize: 16,
    lineHeight: 24,
  },
  statsGrid: {
    marginTop: 18,
  },
  infoCard: {
    marginBottom: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#111c31',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoLabel: {
    color: '#9fb0da',
    fontSize: 13,
  },
  infoValue: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  phoneCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
  phoneTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionEyebrow: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 8,
    color: '#101828',
    fontSize: 22,
    fontWeight: '800',
  },
  metricBox: {
    minWidth: 92,
    borderRadius: 18,
    padding: 14,
    backgroundColor: palette.accent,
  },
  metricLabel: {
    color: palette.contrast,
    opacity: 0.85,
    fontSize: 12,
  },
  metricValue: {
    marginTop: 8,
    color: palette.contrast,
    fontSize: 24,
    fontWeight: '800',
  },
  tabsRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  tabButton: {
    marginRight: 10,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
  },
  tabButtonActive: {
    backgroundColor: palette.accent,
  },
  tabText: {
    color: palette.accentStrong,
    fontWeight: '700',
  },
  tabTextActive: {
    color: palette.contrast,
  },
  screenHero: {
    marginTop: 10,
  },
  screenEyebrow: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  screenTitle: {
    marginTop: 8,
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  pill: {
    marginRight: 10,
    marginBottom: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillText: {
    color: '#dbe2ff',
    fontWeight: '700',
    fontSize: 13,
  },
  tag: {
    marginRight: 10,
    marginBottom: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.surface,
  },
  tagText: {
    color: palette.accentStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  contentCard: {
    marginTop: 14,
    borderRadius: 22,
    padding: 16,
    backgroundColor: palette.surface,
  },
  contentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  contentTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  contentCaption: {
    color: '#6b7280',
    fontSize: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 7,
    marginRight: 10,
    backgroundColor: palette.accent,
  },
  listText: {
    flex: 1,
    color: '#374151',
    fontSize: 14,
    lineHeight: 22,
  },
  detailGrid: {
    marginTop: 18,
  },
  detailCard: {
    marginBottom: 12,
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  detailCaption: {
    marginTop: 8,
    marginBottom: 14,
    color: '#9fb0da',
    fontSize: 14,
  },
});
`
}

function createEasConfig(): string {
  return JSON.stringify(
    {
      build: {
        production: {
          autoIncrement: true,
        },
      },
    },
    null,
    2,
  )
}

function createExpoGitignore(): string {
  return `.expo
node_modules
dist
web-build
npm-debug.*
.DS_Store
`
}

function createExpoReadme(spec: GeneratedApp): string {
  const nativeId = createNativeIdentifier(spec.slug)

  return `# ${spec.name} Expo 原生工程

这是由 Make App 自动生成的 Expo / React Native 安卓 App 工程骨架，可继续构建 Android 安装包。

## 当前配置

- Expo SDK: 55
- React Native: 0.83
- React: 19.2.0
- Android 包名: ${nativeId}

## 本地启动

\`\`\`bash
npm install
npx expo start
\`\`\`

## 本地运行到安卓设备 / 模拟器

\`\`\`bash
npx expo run:android
\`\`\`

## 构建安装包

\`\`\`bash
npx eas-cli login
npx eas-cli build -p android --profile production
\`\`\`

## 当前业务摘要

- 产品定位：${spec.summary}
- 目标用户：${spec.audience}
- 核心卖点：${spec.valueProp}
- 核心模块：${spec.features.join('、')}

## 说明

- 当前工程已经带入预览界面、主题色、功能拆解和多屏切换
- 如果只是要“安卓可安装的 App”，现在这个工程已经够用
- 若要上架商店，再继续补充真实接口、图标、启动页、签名配置和隐私权限说明
`
}

function createNativeIdentifier(slug: string): string {
  const compact = slug.replace(/[^a-z0-9]+/g, '')
  const suffix = compact.slice(0, 24) || 'generatedapp'
  const safeSuffix = /^[a-z]/.test(suffix) ? suffix : `app${suffix}`

  return `com.makeapp.generated.${safeSuffix}`
}
