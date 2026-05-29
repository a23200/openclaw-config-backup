import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type LanguageCode = 'zh' | 'zh-Hant' | 'en' | 'vi' | 'my' | 'th' | 'id' | 'ms' | 'km';

export const languages: Array<{ code: LanguageCode; localName: string; englishName: string }> = [
  { code: 'zh', localName: '中文', englishName: 'Simplified Chinese' },
  { code: 'zh-Hant', localName: '繁體中文', englishName: 'Traditional Chinese' },
  { code: 'en', localName: 'English', englishName: 'English' },
  { code: 'vi', localName: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'my', localName: 'မြန်မာ', englishName: 'Burmese' },
  { code: 'th', localName: 'ไทย', englishName: 'Thai' },
  { code: 'id', localName: 'Indonesia', englishName: 'Indonesian' },
  { code: 'ms', localName: 'Melayu', englishName: 'Malay' },
  { code: 'km', localName: 'ខ្មែរ', englishName: 'Khmer' },
];

type Params = Record<string, string | number | boolean | null | undefined>;
type Dictionary = Record<string, string>;
type Entry = [string, string, string, string, string, string, string, string, string];

const STORAGE_KEY = 'yuyu:language';
const languageOrder: LanguageCode[] = languages.map((language) => language.code);

const entries: Record<string, Entry> = {
  'meta.title': ['鱼鱼 Pro - 自动发货与管家系统', '魚魚 Pro - 自動發貨與管家系統', 'Yuyu Pro - Auto Delivery Console', 'Yuyu Pro - Bảng điều khiển tự động giao hàng', 'Yuyu Pro - အလိုအလျောက်ပို့ဆောင်ရေးကွန်ဆိုးလ်', 'Yuyu Pro - คอนโซลส่งมอบอัตโนมัติ', 'Yuyu Pro - Konsol Pengiriman Otomatis', 'Yuyu Pro - Konsol Penghantaran Automatik', 'Yuyu Pro - ផ្ទាំងគ្រប់គ្រងដឹកជញ្ជូនស្វ័យប្រវត្តិ'],
  'meta.description': ['鱼鱼自动回复、自动发货、订单管理、AI智能议价一体化解决方案', '魚魚自動回覆、自動發貨、訂單管理、AI 智慧議價一體化解決方案', 'Unified auto reply, delivery, order management, and AI bargaining solution for Yuyu', 'Giải pháp hợp nhất cho trả lời tự động, giao hàng, quản lý đơn và thương lượng AI của Yuyu', 'Yuyu အတွက် အလိုအလျောက်ပြန်ကြားခြင်း၊ ပို့ဆောင်ခြင်း၊ အော်ဒါစီမံခြင်းနှင့် AI ဈေးညှိဖြေရှင်းချက်', 'โซลูชันรวมตอบกลับอัตโนมัติ ส่งมอบ จัดการคำสั่งซื้อ และต่อรองด้วย AI สำหรับ Yuyu', 'Solusi terpadu balasan otomatis, pengiriman, manajemen pesanan, dan tawar AI untuk Yuyu', 'Penyelesaian bersepadu balasan automatik, penghantaran, pengurusan pesanan dan tawar-menawar AI untuk Yuyu', 'ដំណោះស្រាយរួមសម្រាប់ឆ្លើយតបស្វ័យប្រវត្តិ ដឹកជញ្ជូន គ្រប់គ្រងបញ្ជាទិញ និងចរចា AI សម្រាប់ Yuyu'],
  'common.productName': ['鱼鱼', '魚魚', 'Yuyu', 'Yuyu', 'Yuyu', 'Yuyu', 'Yuyu', 'Yuyu', 'Yuyu'],
  'common.pro': ['PRO', 'PRO', 'PRO', 'PRO', 'PRO', 'PRO', 'PRO', 'PRO', 'PRO'],
  'common.language': ['语言', '語言', 'Language', 'Ngôn ngữ', 'ဘာသာစကား', 'ภาษา', 'Bahasa', 'Bahasa', 'ភាសា'],
  'common.loading': ['加载中...', '載入中...', 'Loading...', 'Đang tải...', 'ဖွင့်နေသည်...', 'กำลังโหลด...', 'Memuat...', 'Memuatkan...', 'កំពុងផ្ទុក...'],
  'common.refresh': ['刷新', '重新整理', 'Refresh', 'Làm mới', 'ပြန်လည်စတင်', 'รีเฟรช', 'Segarkan', 'Segar semula', 'ធ្វើឱ្យស្រស់'],
  'common.save': ['保存', '儲存', 'Save', 'Lưu', 'သိမ်းဆည်း', 'บันทึก', 'Simpan', 'Simpan', 'រក្សាទុក'],
  'common.saving': ['保存中...', '儲存中...', 'Saving...', 'Đang lưu...', 'သိမ်းနေသည်...', 'กำลังบันทึก...', 'Menyimpan...', 'Sedang menyimpan...', 'កំពុងរក្សាទុក...'],
  'common.cancel': ['取消', '取消', 'Cancel', 'Hủy', 'မလုပ်တော့ပါ', 'ยกเลิก', 'Batal', 'Batal', 'បោះបង់'],
  'common.confirm': ['确定', '確定', 'OK', 'OK', 'အိုကေ', 'ตกลง', 'OK', 'OK', 'យល់ព្រម'],
  'common.close': ['关闭', '關閉', 'Close', 'Đóng', 'ပိတ်', 'ปิด', 'Tutup', 'Tutup', 'បិទ'],
  'common.done': ['完成', '完成', 'Done', 'Hoàn tất', 'ပြီးပါပြီ', 'เสร็จสิ้น', 'Selesai', 'Selesai', 'រួចរាល់'],
  'common.edit': ['编辑', '編輯', 'Edit', 'Sửa', 'ပြင်ဆင်', 'แก้ไข', 'Edit', 'Edit', 'កែសម្រួល'],
  'common.delete': ['删除', '刪除', 'Delete', 'Xóa', 'ဖျက်', 'ลบ', 'Hapus', 'Padam', 'លុប'],
  'common.add': ['添加', '新增', 'Add', 'Thêm', 'ထည့်', 'เพิ่ม', 'Tambah', 'Tambah', 'បន្ថែម'],
  'common.actions': ['操作', '操作', 'Actions', 'Thao tác', 'လုပ်ဆောင်ချက်', 'การทำงาน', 'Aksi', 'Tindakan', 'សកម្មភាព'],
  'common.status': ['状态', '狀態', 'Status', 'Trạng thái', 'အခြေအနေ', 'สถานะ', 'Status', 'Status', 'ស្ថានភាព'],
  'common.search': ['搜索', '搜尋', 'Search', 'Tìm kiếm', 'ရှာဖွေ', 'ค้นหา', 'Cari', 'Cari', 'ស្វែងរក'],
  'common.enabled': ['已启用', '已啟用', 'Enabled', 'Đã bật', 'ဖွင့်ထားသည်', 'เปิดใช้งาน', 'Aktif', 'Diaktifkan', 'បានបើក'],
  'common.disabled': ['已禁用', '已停用', 'Disabled', 'Đã tắt', 'ပိတ်ထားသည်', 'ปิดใช้งาน', 'Nonaktif', 'Dilumpuhkan', 'បានបិទ'],
  'common.notSet': ['未设置', '未設定', 'Not set', 'Chưa đặt', 'မသတ်မှတ်ရသေး', 'ยังไม่ได้ตั้งค่า', 'Belum diatur', 'Belum ditetapkan', 'មិនទាន់កំណត់'],
  'common.noData': ['暂无数据', '暫無資料', 'No data yet', 'Chưa có dữ liệu', 'အချက်အလက်မရှိသေးပါ', 'ยังไม่มีข้อมูล', 'Belum ada data', 'Tiada data lagi', 'មិនទាន់មានទិន្នន័យ'],
  'common.empty': ['暂无', '暫無', 'None', 'Không có', 'မရှိသေးပါ', 'ไม่มี', 'Tidak ada', 'Tiada', 'គ្មាន'],
  'common.success': ['成功', '成功', 'Success', 'Thành công', 'အောင်မြင်', 'สำเร็จ', 'Berhasil', 'Berjaya', 'ជោគជ័យ'],
  'common.failed': ['失败', '失敗', 'Failed', 'Thất bại', 'မအောင်မြင်', 'ล้มเหลว', 'Gagal', 'Gagal', 'បរាជ័យ'],
  'common.error': ['错误', '錯誤', 'Error', 'Lỗi', 'အမှား', 'ข้อผิดพลาด', 'Kesalahan', 'Ralat', 'កំហុស'],
  'common.retry': ['重试', '重試', 'Retry', 'Thử lại', 'ထပ်ကြိုးစား', 'ลองอีกครั้ง', 'Coba lagi', 'Cuba lagi', 'សាកល្បងម្ដងទៀត'],
  'common.account': ['账号', '帳號', 'Account', 'Tài khoản', 'အကောင့်', 'บัญชี', 'Akun', 'Akaun', 'គណនី'],
  'common.accountId': ['账号ID', '帳號 ID', 'Account ID', 'ID tài khoản', 'အကောင့် ID', 'ID บัญชี', 'ID akun', 'ID akaun', 'លេខសម្គាល់គណនី'],
  'common.selectAccount': ['请选择账号', '請選擇帳號', 'Select an account', 'Chọn tài khoản', 'အကောင့်ရွေးပါ', 'เลือกบัญชี', 'Pilih akun', 'Pilih akaun', 'ជ្រើសរើសគណនី'],
  'common.unknownAccount': ['未知账号', '未知帳號', 'Unknown account', 'Tài khoản không rõ', 'မသိသောအကောင့်', 'บัญชีไม่ทราบ', 'Akun tidak dikenal', 'Akaun tidak diketahui', 'គណនីមិនស្គាល់'],
  'common.unknownProduct': ['未知商品', '未知商品', 'Unknown product', 'Sản phẩm không rõ', 'မသိသောကုန်ပစ္စည်း', 'สินค้าไม่ทราบ', 'Produk tidak dikenal', 'Produk tidak diketahui', 'ផលិតផលមិនស្គាល់'],
  'common.unknownSeller': ['匿名卖家', '匿名賣家', 'Anonymous seller', 'Người bán ẩn danh', 'အမည်မဖော်သောရောင်းသူ', 'ผู้ขายไม่ระบุชื่อ', 'Penjual anonim', 'Penjual tanpa nama', 'អ្នកលក់អនាមិក'],
  'common.unknownArea': ['地区未知', '地區未知', 'Unknown area', 'Khu vực không rõ', 'နေရာမသိ', 'ไม่ทราบพื้นที่', 'Area tidak dikenal', 'Kawasan tidak diketahui', 'តំបន់មិនស្គាល់'],
  'common.noTags': ['无额外标签', '無額外標籤', 'No extra tags', 'Không có nhãn thêm', 'အပိုတံဆိပ်မရှိ', 'ไม่มีแท็กเพิ่มเติม', 'Tidak ada tag tambahan', 'Tiada tag tambahan', 'មិនមានស្លាកបន្ថែម'],
  'common.quantity': ['数量', '數量', 'Quantity', 'Số lượng', 'အရေအတွက်', 'จำนวน', 'Jumlah', 'Kuantiti', 'ចំនួន'],
  'common.countUnit': ['条', '筆', 'items', 'mục', 'ခု', 'รายการ', 'item', 'item', 'ធាតុ'],
  'common.pageIndicator': ['第 {{page}} 页 / 共 {{totalPages}} 页', '第 {{page}} 頁 / 共 {{totalPages}} 頁', 'Page {{page}} of {{totalPages}}', 'Trang {{page}} / {{totalPages}}', 'စာမျက်နှာ {{page}} / {{totalPages}}', 'หน้า {{page}} / {{totalPages}}', 'Halaman {{page}} dari {{totalPages}}', 'Halaman {{page}} daripada {{totalPages}}', 'ទំព័រ {{page}} / {{totalPages}}'],
  'common.previousPage': ['上一页', '上一頁', 'Previous', 'Trang trước', 'ယခင်စာမျက်နှာ', 'ก่อนหน้า', 'Sebelumnya', 'Sebelumnya', 'ទំព័រមុន'],
  'common.nextPage': ['下一页', '下一頁', 'Next', 'Tiếp theo', 'နောက်စာမျက်နှာ', 'ถัดไป', 'Berikutnya', 'Seterusnya', 'ទំព័របន្ទាប់'],
  'common.view': ['查看', '檢視', 'View', 'Xem', 'ကြည့်', 'ดู', 'Lihat', 'Lihat', 'មើល'],
  'common.viewDetails': ['查看详情', '檢視詳情', 'View details', 'Xem chi tiết', 'အသေးစိတ်ကြည့်', 'ดูรายละเอียด', 'Lihat detail', 'Lihat butiran', 'មើលលម្អិត'],
  'common.requiredStar': ['*', '*', '*', '*', '*', '*', '*', '*', '*'],
  'common.seconds': ['秒', '秒', 'seconds', 'giây', 'စက္ကန့်', 'วินาที', 'detik', 'saat', 'វិនាទី'],
  'common.minutes': ['分钟', '分鐘', 'minutes', 'phút', 'မိနစ်', 'นาที', 'menit', 'minit', 'នាទី'],
  'common.itemsCount': ['{{count}} 个', '{{count}} 個', '{{count}} items', '{{count}} mục', '{{count}} ခု', '{{count}} รายการ', '{{count}} item', '{{count}} item', '{{count}} ធាតុ'],
  'alerts.updateFailedRetry': ['更新失败，请重试', '更新失敗，請重試', 'Update failed. Please retry.', 'Cập nhật thất bại, vui lòng thử lại.', 'အပ်ဒိတ်မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', 'อัปเดตไม่สำเร็จ โปรดลองอีกครั้ง', 'Pembaruan gagal, coba lagi.', 'Kemas kini gagal, cuba lagi.', 'ការធ្វើបច្ចុប្បន្នភាពបរាជ័យ សូមព្យាយាមម្តងទៀត។'],
  'alerts.deleteFailedRetry': ['删除失败，请重试', '刪除失敗，請重試', 'Delete failed. Please retry.', 'Xóa thất bại, vui lòng thử lại.', 'ဖျက်ရန်မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', 'ลบไม่สำเร็จ โปรดลองอีกครั้ง', 'Gagal menghapus, coba lagi.', 'Gagal memadam, cuba lagi.', 'លុបបរាជ័យ សូមព្យាយាមម្តងទៀត។'],
  'alerts.addFailedRetry': ['添加失败，请重试', '新增失敗，請重試', 'Add failed. Please retry.', 'Thêm thất bại, vui lòng thử lại.', 'ထည့်ရန်မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', 'เพิ่มไม่สำเร็จ โปรดลองอีกครั้ง', 'Gagal menambah, coba lagi.', 'Gagal menambah, cuba lagi.', 'បន្ថែមបរាជ័យ សូមព្យាយាមម្តងទៀត។'],
  'alerts.saveSuccess': ['保存成功！', '儲存成功！', 'Saved successfully.', 'Lưu thành công.', 'သိမ်းဆည်းပြီးပါပြီ။', 'บันทึกสำเร็จ', 'Berhasil disimpan.', 'Berjaya disimpan.', 'បានរក្សាទុកដោយជោគជ័យ។'],
  'alerts.deleteSuccess': ['删除成功！', '刪除成功！', 'Deleted successfully.', 'Xóa thành công.', 'ဖျက်ပြီးပါပြီ။', 'ลบสำเร็จ', 'Berhasil dihapus.', 'Berjaya dipadam.', 'បានលុបដោយជោគជ័យ។'],
  'alerts.clearSuccess': ['清空成功！', '清空成功！', 'Cleared successfully.', 'Đã xóa sạch.', 'ရှင်းလင်းပြီးပါပြီ။', 'ล้างสำเร็จ', 'Berhasil dikosongkan.', 'Berjaya dikosongkan.', 'បានសម្អាតដោយជោគជ័យ។'],
  'alerts.saveFailed': ['保存失败：{{message}}', '儲存失敗：{{message}}', 'Save failed: {{message}}', 'Lưu thất bại: {{message}}', 'သိမ်းဆည်းမှုမအောင်မြင်ပါ: {{message}}', 'บันทึกไม่สำเร็จ: {{message}}', 'Gagal menyimpan: {{message}}', 'Gagal menyimpan: {{message}}', 'រក្សាទុកបរាជ័យ៖ {{message}}'],
  'alerts.operationFailed': ['操作失败：{{message}}', '操作失敗：{{message}}', 'Operation failed: {{message}}', 'Thao tác thất bại: {{message}}', 'လုပ်ဆောင်မှုမအောင်မြင်ပါ: {{message}}', 'ดำเนินการไม่สำเร็จ: {{message}}', 'Operasi gagal: {{message}}', 'Operasi gagal: {{message}}', 'ប្រតិបត្តិការបរាជ័យ៖ {{message}}'],
  'auth.welcome': ['欢迎回来', '歡迎回來', 'Welcome back', 'Chào mừng trở lại', 'ပြန်လည်ကြိုဆိုပါတယ်', 'ยินดีต้อนรับกลับ', 'Selamat datang kembali', 'Selamat kembali', 'សូមស្វាគមន៍ត្រឡប់មកវិញ'],
  'auth.subtitle': ['鱼鱼智能自动发货与管家系统', '魚魚智慧自動發貨與管家系統', 'Yuyu intelligent auto delivery and manager system', 'Hệ thống quản gia và giao hàng tự động thông minh Yuyu', 'Yuyu ဉာဏ်ရည်မြင့် အလိုအလျောက်ပို့ဆောင်ရေးနှင့် စီမံခန့်ခွဲရေးစနစ်', 'ระบบจัดการและส่งมอบอัตโนมัติอัจฉริยะ Yuyu', 'Sistem manajer dan pengiriman otomatis cerdas Yuyu', 'Sistem pengurus dan penghantaran automatik pintar Yuyu', 'ប្រព័ន្ធគ្រប់គ្រង និងដឹកជញ្ជូនស្វ័យប្រវត្តិឆ្លាតវៃ Yuyu'],
  'auth.usernamePlaceholder': ['管理员账号', '管理員帳號', 'Admin account', 'Tài khoản quản trị', 'အက်ဒမင်အကောင့်', 'บัญชีผู้ดูแล', 'Akun admin', 'Akaun pentadbir', 'គណនីអ្នកគ្រប់គ្រង'],
  'auth.passwordPlaceholder': ['密码', '密碼', 'Password', 'Mật khẩu', 'စကားဝှက်', 'รหัสผ่าน', 'Kata sandi', 'Kata laluan', 'ពាក្យសម្ងាត់'],
  'auth.login': ['立即登录', '立即登入', 'Sign in now', 'Đăng nhập ngay', 'ယခုဝင်မည်', 'เข้าสู่ระบบทันที', 'Masuk sekarang', 'Log masuk sekarang', 'ចូលឥឡូវនេះ'],
  'auth.guest': ['游客试用 (无需账号)', '訪客試用（無需帳號）', 'Try as guest (no account needed)', 'Dùng thử khách (không cần tài khoản)', 'ဧည့်သည်အဖြစ် စမ်းသုံးပါ (အကောင့်မလို)', 'ทดลองแบบผู้เยี่ยมชม (ไม่ต้องมีบัญชี)', 'Coba sebagai tamu (tanpa akun)', 'Cuba sebagai tetamu (tanpa akaun)', 'សាកល្បងជាភ្ញៀវ (មិនត្រូវការគណនី)'],
  'auth.loginFailed': ['登录失败', '登入失敗', 'Sign-in failed', 'Đăng nhập thất bại', 'ဝင်ရောက်မှုမအောင်မြင်', 'เข้าสู่ระบบไม่สำเร็จ', 'Gagal masuk', 'Log masuk gagal', 'ចូលបរាជ័យ'],
  'auth.serverUnavailable': ['无法连接服务器', '無法連線伺服器', 'Cannot connect to the server', 'Không thể kết nối máy chủ', 'ဆာဗာကို ချိတ်ဆက်မရပါ', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์', 'Tidak dapat terhubung ke server', 'Tidak dapat menyambung ke pelayan', 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ'],
  'nav.dashboard': ['仪表盘', '儀表板', 'Dashboard', 'Bảng điều khiển', 'ဒက်ရှ်ဘုတ်', 'แดชบอร์ด', 'Dasbor', 'Papan pemuka', 'ផ្ទាំងគ្រប់គ្រង'],
  'nav.accounts': ['账号管理', '帳號管理', 'Accounts', 'Tài khoản', 'အကောင့်များ', 'บัญชี', 'Akun', 'Akaun', 'គណនី'],
  'nav.orders': ['订单管理', '訂單管理', 'Orders', 'Đơn hàng', 'အော်ဒါများ', 'คำสั่งซื้อ', 'Pesanan', 'Pesanan', 'បញ្ជាទិញ'],
  'nav.conversations': ['聊天记录', '聊天記錄', 'Conversations', 'Hội thoại', 'စကားပြောမှတ်တမ်း', 'ประวัติแชท', 'Percakapan', 'Perbualan', 'ការសន្ទនា'],
  'nav.cards': ['卡密库存', '卡密庫存', 'Card Inventory', 'Kho thẻ', 'ကတ်လက်ကျန်', 'คลังคีย์การ์ด', 'Stok Kartu', 'Inventori Kad', 'ស្តុកកាត'],
  'nav.items': ['商品列表', '商品清單', 'Products', 'Sản phẩm', 'ကုန်ပစ္စည်းများ', 'สินค้า', 'Produk', 'Produk', 'ផលិតផល'],
  'nav.publish': ['发布商品', '發布商品', 'Publish Product', 'Đăng sản phẩm', 'ကုန်ပစ္စည်းတင်', 'ลงสินค้า', 'Terbitkan Produk', 'Terbit Produk', 'ផ្សព្វផ្សាយផលិតផល'],
  'nav.batchPublish': ['批量发布', '批次發布', 'Batch Publish', 'Đăng hàng loạt', 'အများအပြားတင်', 'ลงจำนวนมาก', 'Terbit Massal', 'Terbit Pukal', 'ផ្សព្វផ្សាយជាបាច់'],
  'nav.marketResearch': ['市场调研', '市場調研', 'Market Research', 'Nghiên cứu thị trường', 'စျေးကွက်သုတေသန', 'วิจัยตลาด', 'Riset Pasar', 'Kajian Pasaran', 'ស្រាវជ្រាវទីផ្សារ'],
  'nav.keywords': ['关键词管理', '關鍵字管理', 'Keywords', 'Từ khóa', 'သော့ချက်စာလုံးများ', 'คีย์เวิร์ด', 'Kata kunci', 'Kata kunci', 'ពាក្យគន្លឹះ'],
  'nav.settings': ['系统与AI', '系統與 AI', 'System & AI', 'Hệ thống & AI', 'စနစ်နှင့် AI', 'ระบบและ AI', 'Sistem & AI', 'Sistem & AI', 'ប្រព័ន្ធ និង AI'],
  'nav.logout': ['退出登录', '登出', 'Sign out', 'Đăng xuất', 'ထွက်မည်', 'ออกจากระบบ', 'Keluar', 'Log keluar', 'ចេញ'],
  'status.processing': ['处理中', '處理中', 'Processing', 'Đang xử lý', 'လုပ်ဆောင်နေသည်', 'กำลังดำเนินการ', 'Diproses', 'Sedang diproses', 'កំពុងដំណើរការ'],
  'status.pendingShip': ['待发货', '待發貨', 'Pending delivery', 'Chờ giao', 'ပို့ဆောင်ရန်စောင့်နေ', 'รอจัดส่ง', 'Menunggu kirim', 'Menunggu penghantaran', 'រង់ចាំដឹកជញ្ជូន'],
  'status.shipped': ['已发货', '已發貨', 'Shipped', 'Đã giao', 'ပို့ပြီး', 'จัดส่งแล้ว', 'Terkirim', 'Telah dihantar', 'បានដឹកជញ្ជូន'],
  'status.completed': ['已完成', '已完成', 'Completed', 'Hoàn tất', 'ပြီးဆုံး', 'เสร็จสิ้น', 'Selesai', 'Selesai', 'បានបញ្ចប់'],
  'status.cancelled': ['已取消', '已取消', 'Cancelled', 'Đã hủy', 'ပယ်ဖျက်ပြီး', 'ยกเลิกแล้ว', 'Dibatalkan', 'Dibatalkan', 'បានបោះបង់'],
  'status.refunding': ['退款中', '退款中', 'Refunding', 'Đang hoàn tiền', 'ငွေပြန်အမ်းနေ', 'กำลังคืนเงิน', 'Pengembalian dana', 'Bayaran balik', 'កំពុងសងប្រាក់'],
  'status.online': ['在线', '在線', 'Online', 'Trực tuyến', 'အွန်လိုင်း', 'ออนไลน์', 'Online', 'Dalam talian', 'អនឡាញ'],
  'status.disconnected': ['连接中断', '連線中斷', 'Disconnected', 'Mất kết nối', 'ချိတ်ဆက်မှုပြတ်', 'ตัดการเชื่อมต่อ', 'Terputus', 'Terputus sambungan', 'ផ្តាច់ការតភ្ជាប់'],
  'status.paused': ['暂停', '暫停', 'Paused', 'Tạm dừng', 'ရပ်နားထားသည်', 'หยุดชั่วคราว', 'Dijeda', 'Dijeda', 'បានផ្អាក'],
  'dashboard.title': ['运营概览', '營運概覽', 'Operations Overview', 'Tổng quan vận hành', 'လုပ်ငန်းခြုံငုံသုံးသပ်ချက်', 'ภาพรวมการดำเนินงาน', 'Ringkasan Operasi', 'Gambaran Operasi', 'ទិដ្ឋភាពប្រតិបត្តិការ'],
  'dashboard.subtitle': ['欢迎回来，以下是鱼鱼店铺的实时经营数据。', '歡迎回來，以下是魚魚店鋪的即時經營資料。', 'Welcome back. Here is the live operating data for your Yuyu shop.', 'Chào mừng trở lại. Đây là dữ liệu vận hành trực tiếp của cửa hàng Yuyu.', 'ပြန်လည်ကြိုဆိုပါတယ်။ ဤသည်မှာ သင့် Yuyu ဆိုင်၏ တိုက်ရိုက်လုပ်ငန်းဒေတာဖြစ်သည်။', 'ยินดีต้อนรับกลับ นี่คือข้อมูลการดำเนินงานสดของร้าน Yuyu', 'Selamat datang kembali. Ini data operasional langsung toko Yuyu Anda.', 'Selamat kembali. Ini data operasi langsung kedai Yuyu anda.', 'សូមស្វាគមន៍ត្រឡប់មកវិញ។ នេះជាទិន្នន័យប្រតិបត្តិការផ្ទាល់របស់ហាង Yuyu។'],
  'dashboard.systemHealthy': ['系统正常运行', '系統正常運行', 'System running normally', 'Hệ thống hoạt động bình thường', 'စနစ် ပုံမှန်လည်ပတ်နေသည်', 'ระบบทำงานปกติ', 'Sistem berjalan normal', 'Sistem berjalan normal', 'ប្រព័ន្ធដំណើរការធម្មតា'],
  'dashboard.range.today': ['今天', '今天', 'Today', 'Hôm nay', 'ယနေ့', 'วันนี้', 'Hari ini', 'Hari ini', 'ថ្ងៃនេះ'],
  'dashboard.range.yesterday': ['昨天', '昨天', 'Yesterday', 'Hôm qua', 'မနေ့က', 'เมื่อวาน', 'Kemarin', 'Semalam', 'ម្សិលមិញ'],
  'dashboard.range.3days': ['三天内', '三天內', 'Last 3 days', '3 ngày qua', '၃ ရက်အတွင်း', '3 วันที่ผ่านมา', '3 hari terakhir', '3 hari lepas', '៣ ថ្ងៃចុងក្រោយ'],
  'dashboard.range.7days': ['7天内', '7 天內', 'Last 7 days', '7 ngày qua', '၇ ရက်အတွင်း', '7 วันที่ผ่านมา', '7 hari terakhir', '7 hari lepas', '៧ ថ្ងៃចុងក្រោយ'],
  'dashboard.range.30days': ['一个月内', '一個月內', 'Last month', 'Một tháng qua', 'ပြီးခဲ့သည့်တစ်လ', 'หนึ่งเดือนที่ผ่านมา', 'Sebulan terakhir', 'Sebulan lepas', 'មួយខែចុងក្រោយ'],
  'dashboard.range.custom': ['自定义', '自訂', 'Custom', 'Tùy chỉnh', 'စိတ်ကြိုက်', 'กำหนดเอง', 'Kustom', 'Tersuai', 'ផ្ទាល់ខ្លួន'],
  'dashboard.apply': ['应用', '套用', 'Apply', 'Áp dụng', 'အသုံးပြု', 'ใช้', 'Terapkan', 'Guna', 'អនុវត្ត'],
  'dashboard.totalRevenue': ['累计营收 (CNY)', '累計營收 (CNY)', 'Total revenue (CNY)', 'Doanh thu lũy kế (CNY)', 'စုစုပေါင်းဝင်ငွေ (CNY)', 'รายได้สะสม (CNY)', 'Total pendapatan (CNY)', 'Jumlah hasil (CNY)', 'ចំណូលសរុប (CNY)'],
  'dashboard.activeAccounts': ['活跃账号 / 总数', '活躍帳號 / 總數', 'Active / total accounts', 'Tài khoản hoạt động / tổng', 'အသုံးပြုနေ / စုစုပေါင်းအကောင့်', 'บัญชีใช้งาน / ทั้งหมด', 'Akun aktif / total', 'Akaun aktif / jumlah', 'គណនីសកម្ម / សរុប'],
  'dashboard.orderCount': ['订单数', '訂單數', 'Orders', 'Đơn hàng', 'အော်ဒါအရေအတွက်', 'จำนวนคำสั่งซื้อ', 'Pesanan', 'Pesanan', 'ចំនួនបញ្ជាទិញ'],
  'dashboard.cardStock': ['库存卡密余量', '庫存卡密餘量', 'Remaining card stock', 'Tồn kho thẻ còn lại', 'ကျန်ကတ်လက်ကျန်', 'สต็อกคีย์การ์ดคงเหลือ', 'Sisa stok kartu', 'Baki stok kad', 'ស្តុកកាតនៅសល់'],
  'dashboard.revenueTrend': ['营收趋势分析', '營收趨勢分析', 'Revenue Trend', 'Xu hướng doanh thu', 'ဝင်ငွေလမ်းကြောင်း', 'แนวโน้มรายได้', 'Tren Pendapatan', 'Trend Hasil', 'និន្នាការចំណូល'],
  'dashboard.last7Sales': ['最近7天的销售额走势', '最近 7 天的銷售額走勢', 'Sales trend over the last 7 days', 'Xu hướng doanh số 7 ngày qua', 'ပြီးခဲ့သည့် ၇ ရက်ရောင်းအားလမ်းကြောင်း', 'แนวโน้มยอดขาย 7 วันที่ผ่านมา', 'Tren penjualan 7 hari terakhir', 'Trend jualan 7 hari lepas', 'និន្នាការលក់ ៧ ថ្ងៃចុងក្រោយ'],
  'dashboard.noRevenue': ['暂无营收数据', '暫無營收資料', 'No revenue data yet', 'Chưa có dữ liệu doanh thu', 'ဝင်ငွေဒေတာမရှိသေးပါ', 'ยังไม่มีข้อมูลรายได้', 'Belum ada data pendapatan', 'Tiada data hasil lagi', 'មិនទាន់មានទិន្នន័យចំណូល'],
  'dashboard.noOrdersInRange': ['所选时间范围内暂无订单记录', '所選時間範圍內暫無訂單記錄', 'No orders in the selected time range', 'Không có đơn trong khoảng thời gian đã chọn', 'ရွေးထားသောကာလအတွင်း အော်ဒါမရှိပါ', 'ไม่มีคำสั่งซื้อในช่วงเวลาที่เลือก', 'Tidak ada pesanan pada rentang waktu ini', 'Tiada pesanan dalam julat masa dipilih', 'គ្មានបញ្ជាទិញក្នុងរយៈពេលដែលបានជ្រើស'],
  'dashboard.productSalesRank': ['商品销量排行', '商品銷量排行', 'Product Sales Ranking', 'Xếp hạng doanh số sản phẩm', 'ကုန်ပစ္စည်းရောင်းအားအဆင့်', 'อันดับยอดขายสินค้า', 'Peringkat Penjualan Produk', 'Kedudukan Jualan Produk', 'ចំណាត់ថ្នាក់លក់ផលិតផល'],
  'dashboard.productOrderShare': ['商品下单占比', '商品下單占比', 'Product Order Share', 'Tỷ lệ đơn theo sản phẩm', 'ကုန်ပစ္စည်းအော်ဒါဝေစု', 'สัดส่วนคำสั่งซื้อตามสินค้า', 'Porsi Pesanan Produk', 'Bahagian Pesanan Produk', 'ភាគរយបញ្ជាទិញផលិតផល'],
  'dashboard.statOrders': ['参与统计的订单', '參與統計的訂單', 'Orders Included in Stats', 'Đơn được tính thống kê', 'စာရင်းအင်းတွင်ပါသောအော်ဒါများ', 'คำสั่งซื้อที่นับในสถิติ', 'Pesanan dalam Statistik', 'Pesanan Dalam Statistik', 'បញ្ជាទិញក្នុងស្ថិតិ'],
  'dashboard.searchOrdersPlaceholder': ['搜索订单号/商品/买家...', '搜尋訂單號/商品/買家...', 'Search order, product, buyer...', 'Tìm đơn, sản phẩm, người mua...', 'အော်ဒါ၊ ကုန်ပစ္စည်း၊ ဝယ်သူရှာ...', 'ค้นหาออเดอร์/สินค้า/ผู้ซื้อ...', 'Cari pesanan/produk/pembeli...', 'Cari pesanan/produk/pembeli...', 'ស្វែងរកបញ្ជាទិញ/ផលិតផល/អ្នកទិញ...'],
  'dashboard.amountAnalysis': ['商品金额分析 (TOP5)', '商品金額分析 (TOP5)', 'Product Amount Analysis (TOP5)', 'Phân tích giá trị sản phẩm (TOP5)', 'ကုန်ပစ္စည်းငွေပမာဏခွဲခြမ်းစိတ်ဖြာမှု (TOP5)', 'วิเคราะห์มูลค่าสินค้า (TOP5)', 'Analisis Nilai Produk (TOP5)', 'Analisis Jumlah Produk (TOP5)', 'វិភាគតម្លៃផលិតផល (TOP5)'],
  'dashboard.revenueTooltip': ['营收: ¥{{amount}}', '營收: ¥{{amount}}', 'Revenue: ¥{{amount}}', 'Doanh thu: ¥{{amount}}', 'ဝင်ငွေ: ¥{{amount}}', 'รายได้: ¥{{amount}}', 'Pendapatan: ¥{{amount}}', 'Hasil: ¥{{amount}}', 'ចំណូល: ¥{{amount}}'],
  'orders.title': ['订单中心', '訂單中心', 'Order Center', 'Trung tâm đơn hàng', 'အော်ဒါစင်တာ', 'ศูนย์คำสั่งซื้อ', 'Pusat Pesanan', 'Pusat Pesanan', 'មជ្ឈមណ្ឌលបញ្ជាទិញ'],
  'orders.subtitle': ['查看所有鱼鱼交易记录与状态。', '檢視所有魚魚交易記錄與狀態。', 'View all Yuyu transaction records and statuses.', 'Xem tất cả giao dịch và trạng thái Yuyu.', 'Yuyu အရောင်းအဝယ်မှတ်တမ်းနှင့် အခြေအနေအားလုံးကိုကြည့်ပါ။', 'ดูบันทึกธุรกรรมและสถานะทั้งหมดของ Yuyu', 'Lihat semua catatan dan status transaksi Yuyu.', 'Lihat semua rekod transaksi dan status Yuyu.', 'មើលកំណត់ត្រា និងស្ថានភាពប្រតិបត្តិការរបស់ Yuyu ទាំងអស់។'],
  'orders.insertOrder': ['插入订单', '插入訂單', 'Insert Order', 'Chèn đơn hàng', 'အော်ဒါထည့်', 'เพิ่มคำสั่งซื้อ', 'Sisipkan Pesanan', 'Masukkan Pesanan', 'បញ្ចូលបញ្ជាទិញ'],
  'orders.repairMedia': ['补全订单商品信息', '補全訂單商品資訊', 'Complete order product info', 'Bổ sung thông tin sản phẩm đơn hàng', 'အော်ဒါကုန်ပစ္စည်းအချက်အလက်ဖြည့်', 'เติมข้อมูลสินค้าในคำสั่งซื้อ', 'Lengkapi info produk pesanan', 'Lengkapkan maklumat produk pesanan', 'បំពេញព័ត៌មានផលិតផលក្នុងបញ្ជាទិញ'],
  'orders.syncAll': ['一键同步订单', '一鍵同步訂單', 'Sync Orders', 'Đồng bộ đơn hàng', 'အော်ဒါများစင့်ခ်', 'ซิงค์คำสั่งซื้อ', 'Sinkronkan Pesanan', 'Segerakkan Pesanan', 'ធ្វើសមកាលកម្មបញ្ជាទិញ'],
  'orders.filter.all': ['全部', '全部', 'All', 'Tất cả', 'အားလုံး', 'ทั้งหมด', 'Semua', 'Semua', 'ទាំងអស់'],
  'orders.filter.other': ['其他', '其他', 'Other', 'Khác', 'အခြား', 'อื่นๆ', 'Lainnya', 'Lain-lain', 'ផ្សេងទៀត'],
  'orders.table.orderInfo': ['订单信息', '訂單資訊', 'Order Info', 'Thông tin đơn', 'အော်ဒါအချက်အလက်', 'ข้อมูลคำสั่งซื้อ', 'Info Pesanan', 'Maklumat Pesanan', 'ព័ត៌មានបញ្ជាទិញ'],
  'orders.table.buyerInfo': ['买家信息', '買家資訊', 'Buyer Info', 'Thông tin người mua', 'ဝယ်သူအချက်အလက်', 'ข้อมูลผู้ซื้อ', 'Info Pembeli', 'Maklumat Pembeli', 'ព័ត៌មានអ្នកទិញ'],
  'orders.table.amountPaid': ['实付金额', '實付金額', 'Paid Amount', 'Số tiền thanh toán', 'ပေးချေငွေ', 'ยอดชำระจริง', 'Jumlah Dibayar', 'Jumlah Dibayar', 'ចំនួនបានបង់'],
  'orders.table.currentStatus': ['当前状态', '目前狀態', 'Current Status', 'Trạng thái hiện tại', 'လက်ရှိအခြေအနေ', 'สถานะปัจจุบัน', 'Status Saat Ini', 'Status Semasa', 'ស្ថានភាពបច្ចុប្បន្ន'],
  'orders.orderId': ['订单ID', '訂單 ID', 'Order ID', 'ID đơn hàng', 'အော်ဒါ ID', 'ID คำสั่งซื้อ', 'ID Pesanan', 'ID Pesanan', 'លេខសម្គាល់បញ្ជាទិញ'],
  'orders.productId': ['商品ID', '商品 ID', 'Product ID', 'ID sản phẩm', 'ကုန်ပစ္စည်း ID', 'ID สินค้า', 'ID Produk', 'ID Produk', 'លេខសម្គាល់ផលិតផល'],
  'orders.listQuantity': ['数量: {{count}}', '數量: {{count}}', 'Qty: {{count}}', 'SL: {{count}}', 'အရေအတွက်: {{count}}', 'จำนวน: {{count}}', 'Jml: {{count}}', 'Kuantiti: {{count}}', 'ចំនួន: {{count}}'],
  'orders.buyerId': ['买家ID', '買家 ID', 'Buyer ID', 'ID người mua', 'ဝယ်သူ ID', 'ID ผู้ซื้อ', 'ID Pembeli', 'ID Pembeli', 'លេខសម្គាល់អ្នកទិញ'],
  'orders.receiverName': ['收货人', '收貨人', 'Receiver', 'Người nhận', 'လက်ခံသူ', 'ผู้รับ', 'Penerima', 'Penerima', 'អ្នកទទួល'],
  'orders.receiverPhone': ['联系电话', '聯絡電話', 'Phone', 'Điện thoại', 'ဖုန်း', 'โทรศัพท์', 'Telepon', 'Telefon', 'ទូរស័ព្ទ'],
  'orders.receiverAddress': ['收货地址', '收貨地址', 'Shipping address', 'Địa chỉ nhận hàng', 'ပို့ရန်လိပ်စာ', 'ที่อยู่จัดส่ง', 'Alamat kirim', 'Alamat penghantaran', 'អាសយដ្ឋានដឹកជញ្ជូន'],
  'orders.shipNow': ['立即发货', '立即發貨', 'Ship now', 'Giao ngay', 'ယခုပို့', 'จัดส่งตอนนี้', 'Kirim sekarang', 'Hantar sekarang', 'ដឹកជញ្ជូនឥឡូវ'],
  'orders.viewGoofish': ['查看鱼鱼详情', '檢視魚魚詳情', 'View Yuyu details', 'Xem chi tiết Yuyu', 'Yuyu အသေးစိတ်ကြည့်', 'ดูรายละเอียด Yuyu', 'Lihat detail Yuyu', 'Lihat butiran Yuyu', 'មើលលម្អិត Yuyu'],
  'orders.syncOne': ['同步订单', '同步訂單', 'Sync order', 'Đồng bộ đơn', 'အော်ဒါစင့်ခ်', 'ซิงค์คำสั่งซื้อ', 'Sinkronkan pesanan', 'Segerakkan pesanan', 'ធ្វើសមកាលកម្មបញ្ជាទិញ'],
  'orders.deleteOrder': ['删除订单', '刪除訂單', 'Delete order', 'Xóa đơn', 'အော်ဒါဖျက်', 'ลบคำสั่งซื้อ', 'Hapus pesanan', 'Padam pesanan', 'លុបបញ្ជាទិញ'],
  'orders.detailTitle': ['订单详情', '訂單詳情', 'Order Details', 'Chi tiết đơn hàng', 'အော်ဒါအသေးစိတ်', 'รายละเอียดคำสั่งซื้อ', 'Detail Pesanan', 'Butiran Pesanan', 'លម្អិតបញ្ជាទិញ'],
  'orders.orderNumber': ['订单号', '訂單號', 'Order number', 'Mã đơn', 'အော်ဒါနံပါတ်', 'หมายเลขคำสั่งซื้อ', 'Nomor pesanan', 'Nombor pesanan', 'លេខបញ្ជាទិញ'],
  'orders.createdAt': ['创建时间', '建立時間', 'Created at', 'Thời gian tạo', 'ဖန်တီးချိန်', 'เวลาสร้าง', 'Waktu dibuat', 'Masa dibuat', 'ពេលបង្កើត'],
  'orders.productInfo': ['商品信息', '商品資訊', 'Product Info', 'Thông tin sản phẩm', 'ကုန်ပစ္စည်းအချက်အလက်', 'ข้อมูลสินค้า', 'Info Produk', 'Maklumat Produk', 'ព័ត៌មានផលិតផល'],
  'orders.listPrice': ['标价: {{price}}', '標價: {{price}}', 'List price: {{price}}', 'Giá niêm yết: {{price}}', 'စာရင်းဈေး: {{price}}', 'ราคาป้าย: {{price}}', 'Harga tertera: {{price}}', 'Harga senarai: {{price}}', 'តម្លៃបង្ហាញ: {{price}}'],
  'orders.import.fileLabel': ['选择Excel文件', '選擇 Excel 檔案', 'Choose Excel file', 'Chọn tệp Excel', 'Excel ဖိုင်ရွေးပါ', 'เลือกไฟล์ Excel', 'Pilih file Excel', 'Pilih fail Excel', 'ជ្រើសរើសឯកសារ Excel'],
  'orders.import.support': ['支持 .xlsx 和 .xls 格式', '支援 .xlsx 和 .xls 格式', 'Supports .xlsx and .xls', 'Hỗ trợ .xlsx và .xls', '.xlsx နှင့် .xls ကိုထောက်ပံ့သည်', 'รองรับ .xlsx และ .xls', 'Mendukung .xlsx dan .xls', 'Menyokong .xlsx dan .xls', 'គាំទ្រ .xlsx និង .xls'],
  'orders.import.submit': ['导入订单', '匯入訂單', 'Import Orders', 'Nhập đơn hàng', 'အော်ဒါတင်သွင်း', 'นำเข้าคำสั่งซื้อ', 'Impor Pesanan', 'Import Pesanan', 'នាំចូលបញ្ជាទិញ'],
  'orders.ship.choose': ['请选择发货方式：', '請選擇發貨方式：', 'Choose a delivery method:', 'Chọn cách giao hàng:', 'ပို့ဆောင်နည်းရွေးပါ:', 'เลือกวิธีจัดส่ง:', 'Pilih metode pengiriman:', 'Pilih kaedah penghantaran:', 'ជ្រើសរើសវិធីដឹកជញ្ជូន៖'],
  'orders.ship.statusOnlyTitle': ['仅修改鱼鱼发货状态', '僅修改魚魚發貨狀態', 'Only update Yuyu shipping status', 'Chỉ cập nhật trạng thái giao hàng Yuyu', 'Yuyu ပို့ဆောင်မှုအခြေအနေသာပြောင်း', 'แก้เฉพาะสถานะจัดส่งใน Yuyu', 'Hanya ubah status kirim Yuyu', 'Hanya kemas kini status penghantaran Yuyu', 'កែប្រែតែស្ថានភាពដឹកជញ្ជូន Yuyu'],
  'orders.ship.statusOnlyDesc': ['不实际扣除或发送卡券，仅在鱼鱼平台将订单标记为"已发货"。适用于已经给客户发过货、只是忘记在鱼鱼修改状态的情况。', '不實際扣除或發送卡券，僅在魚魚平台將訂單標記為「已發貨」。適用於已經給客戶發過貨、只是忘記在魚魚修改狀態的情況。', 'Does not deduct or send cards. It only marks the order as shipped on Yuyu. Use this if you already delivered but forgot to update Yuyu.', 'Không trừ hoặc gửi thẻ thật, chỉ đánh dấu đơn là đã giao trên Yuyu. Dùng khi bạn đã giao cho khách nhưng quên cập nhật trạng thái.', 'ကတ်မဖြုတ်၊ မပို့ဘဲ Yuyu တွင် ပို့ပြီးအဖြစ်သာမှတ်မည်။ ပို့ပြီးသော်လည်း အခြေအနေမပြောင်းမိသည့်အခါ သုံးပါ။', 'ไม่หักหรือส่งคีย์การ์ดจริง เพียงทำเครื่องหมายว่าส่งแล้วบน Yuyu ใช้เมื่อส่งให้ลูกค้าแล้วแต่ลืมอัปเดตสถานะ', 'Tidak memotong atau mengirim kartu, hanya menandai pesanan terkirim di Yuyu. Gunakan jika sudah mengirim ke pelanggan tetapi lupa memperbarui status.', 'Tidak menolak atau menghantar kad, hanya menandakan pesanan sebagai dihantar di Yuyu. Guna jika sudah menghantar tetapi terlupa mengemas kini status.', 'មិនកាត់ ឬផ្ញើកាតពិតទេ គ្រាន់តែសម្គាល់ថាបានដឹកជញ្ជូនលើ Yuyu។ ប្រើនៅពេលបានផ្ញើឱ្យអតិថិជនរួច ប៉ុន្តែភ្លេចកែស្ថានភាព។'],
  'orders.ship.fullTitle': ['完整发货（匹配卡券并发送）', '完整發貨（匹配卡券並發送）', 'Full delivery (match and send card)', 'Giao đầy đủ (khớp và gửi thẻ)', 'အပြည့်အစုံပို့ (ကတ်ကိုက်ညီပြီးပို့)', 'จัดส่งครบถ้วน (จับคู่และส่งคีย์การ์ด)', 'Pengiriman penuh (cocokkan dan kirim kartu)', 'Penghantaran penuh (padan dan hantar kad)', 'ដឹកជញ្ជូនពេញលេញ (ផ្គូផ្គង និងផ្ញើកាត)'],
  'orders.ship.fullDesc': ['自动匹配发货规则、获取卡券、发送卡券信息给买家，并修改发货状态。适用于订单既没有发送卡券给买家、也没有修改发货状态的情况。', '自動匹配發貨規則、取得卡券、發送卡券資訊給買家，並修改發貨狀態。適用於訂單尚未發送卡券給買家、也尚未修改發貨狀態的情況。', 'Matches delivery rules, gets a card, sends it to the buyer, and updates shipping status. Use this when nothing has been sent yet.', 'Tự khớp quy tắc, lấy thẻ, gửi cho người mua và cập nhật trạng thái giao. Dùng khi chưa gửi thẻ và chưa cập nhật trạng thái.', 'ပို့ဆောင်မှုစည်းမျဉ်းကိုက်ညီစေပြီး ကတ်ယူ၊ ဝယ်သူထံပို့ကာ အခြေအနေပြောင်းသည်။ မပို့ရသေးသောအော်ဒါများအတွက်သုံးပါ။', 'จับคู่กฎจัดส่ง รับคีย์การ์ด ส่งให้ผู้ซื้อ และอัปเดตสถานะ ใช้เมื่อยังไม่ได้ส่งคีย์การ์ดและยังไม่ได้เปลี่ยนสถานะ', 'Mencocokkan aturan, mengambil kartu, mengirim ke pembeli, dan memperbarui status. Gunakan jika belum ada yang dikirim.', 'Memadankan peraturan, mengambil kad, menghantar kepada pembeli dan mengemas kini status. Guna jika belum dihantar.', 'ផ្គូផ្គងច្បាប់ដឹកជញ្ជូន យកកាត ផ្ញើទៅអ្នកទិញ និងកែស្ថានភាព។ ប្រើនៅពេលមិនទាន់បានផ្ញើអ្វីទេ។'],
  'orders.processingNow': ['正在处理中...', '正在處理中...', 'Processing...', 'Đang xử lý...', 'လုပ်ဆောင်နေသည်...', 'กำลังดำเนินการ...', 'Sedang diproses...', 'Sedang diproses...', 'កំពុងដំណើរការ...'],
  'orders.editTitle': ['编辑订单', '編輯訂單', 'Edit Order', 'Sửa đơn hàng', 'အော်ဒါပြင်', 'แก้ไขคำสั่งซื้อ', 'Edit Pesanan', 'Edit Pesanan', 'កែសម្រួលបញ្ជាទិញ'],
  'orders.orderStatus': ['订单状态', '訂單狀態', 'Order status', 'Trạng thái đơn', 'အော်ဒါအခြေအနေ', 'สถานะคำสั่งซื้อ', 'Status pesanan', 'Status pesanan', 'ស្ថានភាពបញ្ជាទិញ'],
  'orders.productTitle': ['商品标题', '商品標題', 'Product title', 'Tiêu đề sản phẩm', 'ကုန်ပစ္စည်းခေါင်းစဉ်', 'ชื่อสินค้า', 'Judul produk', 'Tajuk produk', 'ចំណងជើងផលិតផល'],
  'orders.saveChanges': ['保存更改', '儲存變更', 'Save Changes', 'Lưu thay đổi', 'ပြောင်းလဲမှုသိမ်း', 'บันทึกการเปลี่ยนแปลง', 'Simpan Perubahan', 'Simpan Perubahan', 'រក្សាទុកការផ្លាស់ប្តូរ'],
  'orders.alert.repairDone': ['补全完成：成功 {{updated}} 条，失败 {{failed}} 条，跳过 {{skipped}} 条。', '補全完成：成功 {{updated}} 筆，失敗 {{failed}} 筆，略過 {{skipped}} 筆。', 'Repair complete: {{updated}} success, {{failed}} failed, {{skipped}} skipped.', 'Hoàn tất bổ sung: thành công {{updated}}, thất bại {{failed}}, bỏ qua {{skipped}}.', 'ဖြည့်စွက်ပြီး: {{updated}} အောင်မြင်၊ {{failed}} မအောင်မြင်၊ {{skipped}} ကျော်ခဲ့သည်။', 'เติมข้อมูลเสร็จ: สำเร็จ {{updated}}, ล้มเหลว {{failed}}, ข้าม {{skipped}}', 'Perbaikan selesai: {{updated}} berhasil, {{failed}} gagal, {{skipped}} dilewati.', 'Lengkap: {{updated}} berjaya, {{failed}} gagal, {{skipped}} dilangkau.', 'បំពេញរួច៖ ជោគជ័យ {{updated}}, បរាជ័យ {{failed}}, រំលង {{skipped}}។'],
  'orders.confirmDelete': ['确认删除该订单吗？删除后无法恢复。', '確認刪除此訂單嗎？刪除後無法復原。', 'Delete this order? This cannot be undone.', 'Xóa đơn này? Không thể khôi phục.', 'ဤအော်ဒါကိုဖျက်မလား။ ပြန်ယူ၍မရပါ။', 'ยืนยันลบคำสั่งซื้อนี้หรือไม่? กู้คืนไม่ได้', 'Hapus pesanan ini? Tidak dapat dipulihkan.', 'Padam pesanan ini? Tidak boleh dipulihkan.', 'លុបបញ្ជាទិញនេះឬ? មិនអាចស្តារវិញបានទេ។'],
  'orders.importSuccess': ['订单导入成功', '訂單匯入成功', 'Orders imported successfully', 'Nhập đơn thành công', 'အော်ဒါတင်သွင်းပြီး', 'นำเข้าคำสั่งซื้อสำเร็จ', 'Pesanan berhasil diimpor', 'Pesanan berjaya diimport', 'បាននាំចូលបញ្ជាទិញដោយជោគជ័យ'],
  'orders.importFailed': ['导入失败，请检查JSON格式', '匯入失敗，請檢查 JSON 格式', 'Import failed. Check the JSON format.', 'Nhập thất bại, kiểm tra định dạng JSON.', 'တင်သွင်းမှုမအောင်မြင်ပါ။ JSON ပုံစံစစ်ပါ။', 'นำเข้าไม่สำเร็จ โปรดตรวจรูปแบบ JSON', 'Impor gagal, periksa format JSON.', 'Import gagal, semak format JSON.', 'នាំចូលបរាជ័យ សូមពិនិត្យទ្រង់ទ្រាយ JSON។'],
  'orders.shipFailed': ['发货失败', '發貨失敗', 'Shipping failed', 'Giao hàng thất bại', 'ပို့ဆောင်မှုမအောင်မြင်', 'จัดส่งไม่สำเร็จ', 'Pengiriman gagal', 'Penghantaran gagal', 'ដឹកជញ្ជូនបរាជ័យ'],
  'orders.requestFailed': ['请求失败', '請求失敗', 'Request failed', 'Yêu cầu thất bại', 'တောင်းဆိုမှုမအောင်မြင်', 'คำขอล้มเหลว', 'Permintaan gagal', 'Permintaan gagal', 'សំណើបរាជ័យ'],
  'accounts.title': ['账号管理', '帳號管理', 'Account Management', 'Quản lý tài khoản', 'အကောင့်စီမံခန့်ခွဲမှု', 'จัดการบัญชี', 'Manajemen Akun', 'Pengurusan Akaun', 'គ្រប់គ្រងគណនី'],
  'accounts.subtitle': ['管理您的鱼鱼授权账号及设置。', '管理您的魚魚授權帳號與設定。', 'Manage your authorized Yuyu accounts and settings.', 'Quản lý tài khoản Yuyu đã ủy quyền và cài đặt.', 'သင့်ခွင့်ပြုထားသော Yuyu အကောင့်များနှင့် ဆက်တင်များကိုစီမံပါ။', 'จัดการบัญชี Yuyu ที่อนุญาตและการตั้งค่า', 'Kelola akun Yuyu resmi dan pengaturannya.', 'Urus akaun Yuyu yang dibenarkan dan tetapannya.', 'គ្រប់គ្រងគណនី Yuyu ដែលបានអនុញ្ញាត និងការកំណត់។'],
  'accounts.addQr': ['扫码添加新账号', '掃碼新增帳號', 'Add account by QR', 'Thêm tài khoản bằng QR', 'QR ဖြင့်အကောင့်ထည့်', 'เพิ่มบัญชีด้วย QR', 'Tambah akun via QR', 'Tambah akaun melalui QR', 'បន្ថែមគណនីតាម QR'],
  'accounts.noRemark': ['暂无备注', '暫無備註', 'No notes yet', 'Chưa có ghi chú', 'မှတ်ချက်မရှိသေးပါ', 'ยังไม่มีหมายเหตุ', 'Belum ada catatan', 'Tiada nota lagi', 'មិនទាន់មានកំណត់ចំណាំ'],
  'accounts.autoReply': ['自动回复', '自動回覆', 'Auto reply', 'Trả lời tự động', 'အလိုအလျောက်ပြန်ကြား', 'ตอบกลับอัตโนมัติ', 'Balasan otomatis', 'Balasan automatik', 'ឆ្លើយតបស្វ័យប្រវត្តិ'],
  'accounts.pauseMinutes': ['暂停{{minutes}}分钟', '暫停 {{minutes}} 分鐘', 'Paused {{minutes}} min', 'Tạm dừng {{minutes}} phút', '{{minutes}} မိနစ်ရပ်ထား', 'หยุด {{minutes}} นาที', 'Dijeda {{minutes}} menit', 'Dijeda {{minutes}} minit', 'ផ្អាក {{minutes}} នាទី'],
  'accounts.editAccount': ['编辑账号', '編輯帳號', 'Edit Account', 'Sửa tài khoản', 'အကောင့်ပြင်', 'แก้ไขบัญชี', 'Edit Akun', 'Edit Akaun', 'កែសម្រួលគណនី'],
  'accounts.aiSettings': ['AI设置', 'AI 設定', 'AI Settings', 'Cài đặt AI', 'AI ဆက်တင်', 'ตั้งค่า AI', 'Pengaturan AI', 'Tetapan AI', 'ការកំណត់ AI'],
  'accounts.emptyTitle': ['暂无账号', '暫無帳號', 'No accounts yet', 'Chưa có tài khoản', 'အကောင့်မရှိသေးပါ', 'ยังไม่มีบัญชี', 'Belum ada akun', 'Tiada akaun lagi', 'មិនទាន់មានគណនី'],
  'accounts.emptySubtitle': ['请点击右上角扫码添加您的鱼鱼账号', '請點擊右上角掃碼新增您的魚魚帳號', 'Use the QR button above to add your Yuyu account.', 'Nhấn nút QR phía trên để thêm tài khoản Yuyu.', 'အပေါ်ဘက် QR ခလုတ်ဖြင့် Yuyu အကောင့်ထည့်ပါ။', 'กดปุ่ม QR ด้านบนเพื่อเพิ่มบัญชี Yuyu', 'Gunakan tombol QR di atas untuk menambah akun Yuyu.', 'Gunakan butang QR di atas untuk menambah akaun Yuyu.', 'ប្រើប៊ូតុង QR ខាងលើ ដើម្បីបន្ថែមគណនី Yuyu។'],
  'accounts.qrLogin': ['扫码登录', '掃碼登入', 'QR Sign-in', 'Đăng nhập QR', 'QR ဖြင့်ဝင်', 'เข้าสู่ระบบด้วย QR', 'Masuk QR', 'Log Masuk QR', 'ចូលតាម QR'],
  'accounts.qrHint': ['请打开鱼鱼APP扫描下方二维码', '請開啟魚魚 APP 掃描下方 QR Code', 'Open the Yuyu app and scan the QR code below.', 'Mở ứng dụng Yuyu và quét mã QR bên dưới.', 'Yuyu အက်ပ်ဖွင့်ပြီး အောက်ပါ QR ကိုစကင်ဖတ်ပါ။', 'เปิดแอป Yuyu แล้วสแกน QR ด้านล่าง', 'Buka aplikasi Yuyu dan pindai QR di bawah.', 'Buka aplikasi Yuyu dan imbas QR di bawah.', 'បើកកម្មវិធី Yuyu ហើយស្កេន QR ខាងក្រោម។'],
  'accounts.loginSuccess': ['登录成功', '登入成功', 'Signed in', 'Đăng nhập thành công', 'ဝင်ပြီးပါပြီ', 'เข้าสู่ระบบสำเร็จ', 'Berhasil masuk', 'Berjaya log masuk', 'ចូលដោយជោគជ័យ'],
  'accounts.fetchFailed': ['获取失败', '取得失敗', 'Failed to fetch', 'Lấy dữ liệu thất bại', 'ရယူမှုမအောင်မြင်', 'ดึงข้อมูลไม่สำเร็จ', 'Gagal mengambil', 'Gagal mendapatkan', 'ទាញយកបរាជ័យ'],
  'accounts.qrExpires': ['二维码有效期为5分钟，请尽快扫码。', 'QR Code 有效期為 5 分鐘，請盡快掃碼。', 'The QR code is valid for 5 minutes. Please scan soon.', 'Mã QR có hiệu lực 5 phút, vui lòng quét sớm.', 'QR ကုဒ်သည် ၅ မိနစ်သာတရားဝင်သည်။ အမြန်စကင်ဖတ်ပါ။', 'QR ใช้ได้ 5 นาที โปรดสแกนโดยเร็ว', 'Kode QR berlaku 5 menit, segera pindai.', 'Kod QR sah selama 5 minit, sila imbas segera.', 'កូដ QR មានសុពលភាព ៥ នាទី សូមស្កេនឱ្យឆាប់។'],
  'accounts.remark': ['备注', '備註', 'Note', 'Ghi chú', 'မှတ်ချက်', 'หมายเหตุ', 'Catatan', 'Nota', 'កំណត់ចំណាំ'],
  'accounts.remarkPlaceholder': ['为账号添加备注', '為帳號新增備註', 'Add a note for this account', 'Thêm ghi chú cho tài khoản', 'အကောင့်အတွက်မှတ်ချက်ထည့်', 'เพิ่มหมายเหตุให้บัญชี', 'Tambahkan catatan akun', 'Tambah nota akaun', 'បន្ថែមកំណត់ចំណាំគណនី'],
  'accounts.cookiePlaceholder': ['更新账号Cookie', '更新帳號 Cookie', 'Update account cookie', 'Cập nhật cookie tài khoản', 'အကောင့် cookie အပ်ဒိတ်', 'อัปเดต cookie บัญชี', 'Perbarui cookie akun', 'Kemas kini cookie akaun', 'ធ្វើបច្ចុប្បន្នភាព cookie គណនី'],
  'accounts.cookieLength': ['当前Cookie长度: {{count}} 字符', '目前 Cookie 長度：{{count}} 字元', 'Current cookie length: {{count}} chars', 'Độ dài cookie hiện tại: {{count}} ký tự', 'လက်ရှိ cookie အရှည်: {{count}} စာလုံး', 'ความยาว cookie ปัจจุบัน: {{count}} อักขระ', 'Panjang cookie saat ini: {{count}} karakter', 'Panjang cookie semasa: {{count}} aksara', 'ប្រវែង cookie បច្ចុប្បន្ន៖ {{count}} តួអក្សរ'],
  'accounts.autoConfirm': ['自动确认收货', '自動確認收貨', 'Auto confirm receipt', 'Tự xác nhận nhận hàng', 'လက်ခံရရှိမှုအလိုအလျောက်အတည်ပြု', 'ยืนยันรับสินค้าอัตโนมัติ', 'Konfirmasi terima otomatis', 'Sahkan penerimaan automatik', 'បញ្ជាក់ការទទួលដោយស្វ័យប្រវត្តិ'],
  'accounts.autoConfirmDesc': ['自动点击确认收货按钮', '自動點擊確認收貨按鈕', 'Automatically click the confirm receipt button', 'Tự bấm nút xác nhận nhận hàng', 'လက်ခံအတည်ပြုခလုတ်ကို အလိုအလျောက်နှိပ်', 'คลิกปุ่มยืนยันรับสินค้าอัตโนมัติ', 'Klik tombol konfirmasi otomatis', 'Klik butang sah terima secara automatik', 'ចុចប៊ូតុងបញ្ជាក់ទទួលដោយស្វ័យប្រវត្តិ'],
  'accounts.pauseDuration': ['暂停处理时长（分钟）', '暫停處理時長（分鐘）', 'Pause duration (minutes)', 'Thời gian tạm dừng (phút)', 'ရပ်နားချိန် (မိနစ်)', 'ระยะเวลาหยุด (นาที)', 'Durasi jeda (menit)', 'Tempoh jeda (minit)', 'រយៈពេលផ្អាក (នាទី)'],
  'accounts.pauseDurationDesc': ['设置后会暂停处理该账号的订单，到时间后自动恢复', '設定後會暫停處理此帳號的訂單，到時間後自動恢復', 'Orders for this account pause and resume automatically after the duration.', 'Đơn của tài khoản này sẽ tạm dừng và tự khôi phục sau thời gian đặt.', 'ဤအကောင့်အော်ဒါများကို ရပ်နားပြီး သတ်မှတ်ချိန်ပြည့်လျှင်ပြန်လည်စတင်မည်။', 'คำสั่งซื้อของบัญชีนี้จะหยุดชั่วคราวและกลับมาเองเมื่อครบเวลา', 'Pesanan akun ini dijeda lalu lanjut otomatis setelah durasi.', 'Pesanan akaun ini dijeda dan disambung automatik selepas tempoh.', 'បញ្ជាទិញគណនីនេះនឹងផ្អាក ហើយបន្តដោយស្វ័យប្រវត្តិបន្ទាប់ពីរយៈពេល។'],
  'accounts.loginInfo': ['登录信息', '登入資訊', 'Login Info', 'Thông tin đăng nhập', 'ဝင်ရောက်မှုအချက်အလက်', 'ข้อมูลเข้าสู่ระบบ', 'Info Login', 'Maklumat Log Masuk', 'ព័ត៌មានចូល'],
  'accounts.username': ['用户名', '使用者名稱', 'Username', 'Tên đăng nhập', 'အသုံးပြုသူအမည်', 'ชื่อผู้ใช้', 'Nama pengguna', 'Nama pengguna', 'ឈ្មោះអ្នកប្រើ'],
  'accounts.usernamePlaceholder': ['鱼鱼账号/手机号', '魚魚帳號/手機號', 'Yuyu account / phone', 'Tài khoản Yuyu / điện thoại', 'Yuyu အကောင့် / ဖုန်း', 'บัญชี Yuyu / เบอร์โทร', 'Akun Yuyu / telepon', 'Akaun Yuyu / telefon', 'គណនី Yuyu / ទូរស័ព្ទ'],
  'accounts.loginPassword': ['登录密码', '登入密碼', 'Login password', 'Mật khẩu đăng nhập', 'ဝင်ရန်စကားဝှက်', 'รหัสผ่านเข้าสู่ระบบ', 'Kata sandi login', 'Kata laluan log masuk', 'ពាក្យសម្ងាត់ចូល'],
  'accounts.loginPasswordPlaceholder': ['用于自动登录', '用於自動登入', 'Used for auto login', 'Dùng cho đăng nhập tự động', 'အလိုအလျောက်ဝင်ရန်အသုံးပြု', 'ใช้สำหรับเข้าสู่ระบบอัตโนมัติ', 'Untuk login otomatis', 'Digunakan untuk log masuk automatik', 'ប្រើសម្រាប់ចូលដោយស្វ័យប្រវត្តិ'],
  'accounts.showBrowser': ['登录时显示浏览器', '登入時顯示瀏覽器', 'Show browser during login', 'Hiển thị trình duyệt khi đăng nhập', 'ဝင်ချိန် browser ပြ', 'แสดงเบราว์เซอร์ตอนเข้าสู่ระบบ', 'Tampilkan browser saat login', 'Tunjukkan pelayar semasa log masuk', 'បង្ហាញកម្មវិធីរុករកពេលចូល'],
  'accounts.showBrowserDesc': ['调试时可开启查看登录过程', '除錯時可開啟查看登入流程', 'Enable while debugging to watch the login flow', 'Bật khi gỡ lỗi để xem quá trình đăng nhập', 'debug လုပ်ချိန်တွင် ဝင်ရောက်မှုကြည့်ရန်ဖွင့်ပါ', 'เปิดเมื่อดีบักเพื่อดูขั้นตอนเข้าสู่ระบบ', 'Aktifkan saat debug untuk melihat alur login', 'Aktifkan semasa debug untuk melihat aliran log masuk', 'បើកពេល debug ដើម្បីមើលដំណើរចូល'],
  'accounts.enableAi': ['启用AI自动回复', '啟用 AI 自動回覆', 'Enable AI auto reply', 'Bật trả lời tự động AI', 'AI အလိုအလျောက်ပြန်ကြားဖွင့်', 'เปิดตอบกลับ AI อัตโนมัติ', 'Aktifkan balasan AI otomatis', 'Aktifkan balasan automatik AI', 'បើកឆ្លើយតប AI ស្វ័យប្រវត្តិ'],
  'accounts.enableAiDesc': ['AI将自动处理买家的砍价消息', 'AI 將自動處理買家的議價訊息', 'AI will handle buyer bargaining messages automatically.', 'AI sẽ tự xử lý tin nhắn trả giá của người mua.', 'AI သည် ဝယ်သူဈေးညှိစာများကို အလိုအလျောက်ကိုင်တွယ်မည်။', 'AI จะจัดการข้อความต่อรองของผู้ซื้ออัตโนมัติ', 'AI akan menangani pesan tawar pembeli otomatis.', 'AI akan mengendalikan mesej tawar-menawar pembeli secara automatik.', 'AI នឹងដោះស្រាយសារចរចារបស់អ្នកទិញដោយស្វ័យប្រវត្តិ។'],
  'accounts.bargainStrategy': ['砍价策略', '議價策略', 'Bargaining Strategy', 'Chiến lược trả giá', 'ဈေးညှိမဟာဗျူဟာ', 'กลยุทธ์ต่อรอง', 'Strategi Tawar', 'Strategi Tawar-menawar', 'យុទ្ធសាស្ត្រចរចា'],
  'accounts.maxDiscountPercent': ['最大折扣比例 (%)', '最大折扣比例 (%)', 'Max discount (%)', 'Giảm tối đa (%)', 'အများဆုံးလျှော့စျေး (%)', 'ส่วนลดสูงสุด (%)', 'Diskon maks (%)', 'Diskaun maks (%)', 'បញ្ចុះតម្លៃអតិបរមា (%)'],
  'accounts.maxDiscountAmount': ['最大折扣金额 (元)', '最大折扣金額 (元)', 'Max discount amount (CNY)', 'Số tiền giảm tối đa (CNY)', 'အများဆုံးလျှော့ငွေ (CNY)', 'จำนวนส่วนลดสูงสุด (CNY)', 'Jumlah diskon maks (CNY)', 'Jumlah diskaun maks (CNY)', 'ចំនួនបញ្ចុះអតិបរមា (CNY)'],
  'accounts.maxBargainRounds': ['最大砍价轮次', '最大議價輪次', 'Max bargaining rounds', 'Số vòng trả giá tối đa', 'အများဆုံးဈေးညှိကြိမ်', 'รอบต่อรองสูงสุด', 'Putaran tawar maks', 'Pusingan tawar-menawar maks', 'ជុំចរចាអតិបរមា'],
  'accounts.examplePercent': ['例如：10表示最多降价10%', '例如：10 表示最多降價 10%', 'Example: 10 means up to 10% off', 'Ví dụ: 10 là giảm tối đa 10%', 'ဥပမာ: 10 သည် 10% အထိလျှော့', 'เช่น 10 หมายถึงลดได้สูงสุด 10%', 'Contoh: 10 berarti diskon hingga 10%', 'Contoh: 10 bermaksud diskaun hingga 10%', 'ឧទាហរណ៍៖ 10 មានន័យថាបញ្ចុះបានដល់ 10%'],
  'accounts.exampleAmount': ['例如：100表示最多降价100元', '例如：100 表示最多降價 100 元', 'Example: 100 means up to ¥100 off', 'Ví dụ: 100 là giảm tối đa 100 tệ', 'ဥပမာ: 100 သည် ¥100 အထိလျှော့', 'เช่น 100 หมายถึงลดได้สูงสุด 100 หยวน', 'Contoh: 100 berarti diskon hingga ¥100', 'Contoh: 100 bermaksud diskaun hingga ¥100', 'ឧទាហរណ៍៖ 100 មានន័យថាបញ្ចុះបានដល់ ¥100'],
  'accounts.exampleRounds': ['买家最多可以砍价的次数', '買家最多可以議價的次數', 'Maximum number of buyer bargaining attempts', 'Số lần người mua có thể trả giá', 'ဝယ်သူဈေးညှိနိုင်သည့် အများဆုံးအကြိမ်', 'จำนวนครั้งสูงสุดที่ผู้ซื้อต่อรองได้', 'Jumlah maksimal pembeli menawar', 'Bilangan maksimum pembeli boleh tawar-menawar', 'ចំនួនអតិបរមាដែលអ្នកទិញអាចចរចា'],
  'accounts.customPrompt': ['自定义提示词（可选）', '自訂提示詞（選填）', 'Custom prompt (optional)', 'Prompt tùy chỉnh (tùy chọn)', 'စိတ်ကြိုက် prompt (ရွေးချယ်နိုင်)', 'พรอมป์กำหนดเอง (ไม่บังคับ)', 'Prompt khusus (opsional)', 'Prompt tersuai (pilihan)', 'ពាក្យបញ្ជាផ្ទាល់ខ្លួន (ស្រេចចិត្ត)'],
  'accounts.customPromptPlaceholder': ['输入自定义的AI回复规则或风格指引...\n\n例如：回复时保持礼貌专业、使用简洁的语言、强调产品质量等', '輸入自訂的 AI 回覆規則或風格指引...\n\n例如：回覆時保持禮貌專業、使用簡潔語言、強調產品品質等', 'Enter custom AI reply rules or tone guidance...\n\nExample: stay polite and professional, use concise language, emphasize product quality.', 'Nhập quy tắc trả lời AI hoặc phong cách...\n\nVí dụ: lịch sự chuyên nghiệp, ngôn ngữ ngắn gọn, nhấn mạnh chất lượng sản phẩm.', 'စိတ်ကြိုက် AI ပြန်ကြားစည်းမျဉ်း သို့မဟုတ် လေသံညွှန်ကြားချက်ရေးပါ...\n\nဥပမာ: ယဉ်ကျေးပရော်ဖက်ရှင်နယ်၊ စာတိုတို၊ ကုန်ပစ္စည်းအရည်အသွေးကိုအလေးပေး။', 'ใส่กฎหรือแนวทางสไตล์ตอบกลับ AI...\n\nเช่น สุภาพมืออาชีพ ใช้ภาษากระชับ เน้นคุณภาพสินค้า', 'Masukkan aturan balasan AI atau panduan gaya...\n\nContoh: sopan profesional, bahasa ringkas, tekankan kualitas produk.', 'Masukkan peraturan balasan AI atau panduan gaya...\n\nContoh: sopan profesional, bahasa ringkas, tekankan kualiti produk.', 'បញ្ចូលច្បាប់ឆ្លើយតប AI ឬណែនាំស្ទីល...\n\nឧទាហរណ៍៖ សុភាពវិជ្ជាជីវៈ ប្រើភាសាខ្លី បញ្ជាក់គុណភាពផលិតផល។'],
  'accounts.howAiWorks': ['AI如何工作', 'AI 如何運作', 'How AI Works', 'AI hoạt động thế nào', 'AI ဘယ်လိုအလုပ်လုပ်သလဲ', 'AI ทำงานอย่างไร', 'Cara AI Bekerja', 'Cara AI Berfungsi', 'របៀបដែល AI ដំណើរការ'],
  'accounts.aiWork1': ['自动识别买家的砍价请求', '自動識別買家的議價請求', 'Detect buyer bargaining requests automatically', 'Tự nhận diện yêu cầu trả giá của người mua', 'ဝယ်သူဈေးညှိတောင်းဆိုမှုကို အလိုအလျောက်သိရှိ', 'ตรวจจับคำขอต่อรองของผู้ซื้ออัตโนมัติ', 'Mendeteksi permintaan tawar pembeli otomatis', 'Mengesan permintaan tawar-menawar pembeli secara automatik', 'រកឃើញសំណើចរចារបស់អ្នកទិញដោយស្វ័យប្រវត្តិ'],
  'accounts.aiWork2': ['根据设定的策略智能回复', '依設定策略智慧回覆', 'Reply intelligently using your strategy', 'Trả lời thông minh theo chiến lược', 'သတ်မှတ်ထားသောမဟာဗျူဟာအတိုင်း ဉာဏ်ရည်မြင့်ပြန်ကြား', 'ตอบกลับอย่างชาญฉลาดตามกลยุทธ์', 'Membalas cerdas sesuai strategi', 'Membalas dengan pintar mengikut strategi', 'ឆ្លើយតបឆ្លាតវៃតាមយុទ្ធសាស្ត្រ'],
  'accounts.aiWork3': ['在合理范围内同意降价或礼貌拒绝', '在合理範圍內同意降價或禮貌拒絕', 'Accept reasonable discounts or politely decline', 'Đồng ý giảm hợp lý hoặc từ chối lịch sự', 'သင့်တော်သောလျှော့စျေးလက်ခံ သို့မဟုတ် ယဉ်ကျေးစွာငြင်း', 'ยอมรับส่วนลดที่เหมาะสมหรือปฏิเสธสุภาพ', 'Setuju diskon wajar atau menolak dengan sopan', 'Terima diskaun munasabah atau menolak dengan sopan', 'យល់ព្រមបញ្ចុះសមហេតុផល ឬបដិសេធដោយសុភាព'],
  'accounts.aiWork4': ['保持专业友好的沟通风格', '保持專業友善的溝通風格', 'Keep a professional and friendly tone', 'Giữ giọng chuyên nghiệp và thân thiện', 'ပရော်ဖက်ရှင်နယ်နှင့် ဖော်ရွေသောလေသံထိန်း', 'รักษาน้ำเสียงมืออาชีพและเป็นมิตร', 'Menjaga nada profesional dan ramah', 'Kekalkan nada profesional dan mesra', 'រក្សាទឹកដមវិជ្ជាជីវៈ និងរួសរាយ'],
  'product.title': ['商品管理', '商品管理', 'Product Management', 'Quản lý sản phẩm', 'ကုန်ပစ္စည်းစီမံခန့်ခွဲမှု', 'จัดการสินค้า', 'Manajemen Produk', 'Pengurusan Produk', 'គ្រប់គ្រងផលិតផល'],
  'product.subtitle': ['监控并管理所有账号下的鱼鱼商品。', '監控並管理所有帳號下的魚魚商品。', 'Monitor and manage Yuyu products across all accounts.', 'Theo dõi và quản lý sản phẩm Yuyu trên mọi tài khoản.', 'အကောင့်အားလုံးရှိ Yuyu ကုန်ပစ္စည်းများကို စောင့်ကြည့်စီမံပါ။', 'ติดตามและจัดการสินค้า Yuyu ในทุกบัญชี', 'Pantau dan kelola produk Yuyu di semua akun.', 'Pantau dan urus produk Yuyu merentas semua akaun.', 'តាមដាន និងគ្រប់គ្រងផលិតផល Yuyu ក្នុងគណនីទាំងអស់។'],
  'product.selectToSync': ['选择账号以同步', '選擇帳號以同步', 'Select account to sync', 'Chọn tài khoản để đồng bộ', 'စင့်ခ်ရန်အကောင့်ရွေး', 'เลือกบัญชีเพื่อซิงค์', 'Pilih akun untuk sinkron', 'Pilih akaun untuk segerak', 'ជ្រើសគណនីដើម្បីសមកាលកម្ម'],
  'product.sync': ['同步商品', '同步商品', 'Sync Products', 'Đồng bộ sản phẩm', 'ကုန်ပစ္စည်းစင့်ခ်', 'ซิงค์สินค้า', 'Sinkronkan Produk', 'Segerakkan Produk', 'ធ្វើសមកាលកម្មផលិតផល'],
  'product.add': ['添加商品', '新增商品', 'Add Product', 'Thêm sản phẩm', 'ကုန်ပစ္စည်းထည့်', 'เพิ่มสินค้า', 'Tambah Produk', 'Tambah Produk', 'បន្ថែមផលិតផល'],
  'product.aiKnowledge': ['AI专属知识库', 'AI 專屬知識庫', 'AI Product Knowledge', 'Kho kiến thức AI', 'AI ကုန်ပစ္စည်းဗဟုသုတ', 'คลังความรู้ AI', 'Pengetahuan AI', 'Pengetahuan AI', 'ចំណេះដឹង AI'],
  'product.priceMissing': ['价格待补充', '價格待補充', 'Price missing', 'Chưa có giá', 'ဈေးနှုန်းလိုအပ်', 'ยังไม่มีราคา', 'Harga belum ada', 'Harga belum ada', 'តម្លៃមិនទាន់មាន'],
  'product.multiSpec': ['多规格', '多規格', 'Multi-spec', 'Nhiều quy cách', 'သတ်မှတ်ချက်များစွာ', 'หลายสเปก', 'Multi-spesifikasi', 'Berbilang spesifikasi', 'ច្រើនលក្ខណៈ'],
  'product.multiQty': ['多数量发货', '多數量發貨', 'Multi-quantity delivery', 'Giao nhiều số lượng', 'အရေအတွက်များစွာပို့', 'จัดส่งหลายจำนวน', 'Pengiriman banyak jumlah', 'Penghantaran berbilang kuantiti', 'ដឹកជញ្ជូនចំនួនច្រើន'],
  'product.empty': ['暂无商品数据，请选择账号进行同步', '暫無商品資料，請選擇帳號進行同步', 'No product data yet. Select an account to sync.', 'Chưa có dữ liệu sản phẩm. Chọn tài khoản để đồng bộ.', 'ကုန်ပစ္စည်းဒေတာမရှိသေးပါ။ စင့်ခ်ရန်အကောင့်ရွေးပါ။', 'ยังไม่มีข้อมูลสินค้า โปรดเลือกบัญชีเพื่อซิงค์', 'Belum ada data produk. Pilih akun untuk sinkron.', 'Tiada data produk lagi. Pilih akaun untuk segerak.', 'មិនទាន់មានទិន្នន័យផលិតផល។ ជ្រើសគណនីដើម្បីសមកាលកម្ម។'],
  'product.aiKnowledgeTitle': ['AI专属知识库喂养', 'AI 專屬知識庫餵養', 'Feed AI Product Knowledge', 'Nạp kho kiến thức AI', 'AI ကုန်ပစ္စည်းဗဟုသုတဖြည့်', 'ป้อนคลังความรู้ AI', 'Isi Pengetahuan AI', 'Isi Pengetahuan AI', 'បញ្ចូលចំណេះដឹង AI'],
  'product.aiKnowledgeSubtitle': ['预设用户可能会问的问题及标准回答方向', '預設使用者可能詢問的問題與標準回答方向', 'Preset likely customer questions and standard answer direction', 'Đặt trước câu hỏi khách có thể hỏi và hướng trả lời chuẩn', 'အသုံးပြုသူမေးနိုင်သောမေးခွန်းများနှင့် စံပြန်ကြားလမ်းညွှန်', 'ตั้งคำถามที่ลูกค้าอาจถามและแนวคำตอบมาตรฐาน', 'Atur pertanyaan pelanggan dan arah jawaban standar', 'Tetapkan soalan pelanggan dan arah jawapan standard', 'កំណត់សំណួរដែលអតិថិជនអាចសួរ និងទិសឆ្លើយស្តង់ដារ'],
  'product.aiHint': ['提示：您可以在这里输入该商品的常见FAQ、底线规则、售后政策。AI在回复客户关于该商品的问题时，会严格参考这里的内容。', '提示：您可以在此輸入此商品的常見 FAQ、底線規則、售後政策。AI 回覆客戶相關問題時會嚴格參考此內容。', 'Tip: Add FAQs, bottom-line rules, and after-sales policy here. AI will strictly reference this when answering product questions.', 'Gợi ý: Thêm FAQ, quy tắc giới hạn và chính sách sau bán. AI sẽ tham khảo nghiêm ngặt khi trả lời về sản phẩm.', 'အကြံပြုချက်: FAQ၊ အနိမ့်ဆုံးစည်းမျဉ်း၊ ရောင်းချပြီးနောက်မူဝါဒများထည့်ပါ။ AI သည် ကုန်ပစ္စည်းမေးခွန်းများဖြေရာတွင် ယင်းကိုတင်းကျပ်စွာကိုးကားမည်။', 'เคล็ดลับ: เพิ่ม FAQ กฎขั้นต่ำ และนโยบายหลังการขายที่นี่ AI จะอ้างอิงอย่างเคร่งครัดเมื่อตอบคำถามสินค้า', 'Tips: Tambahkan FAQ, batas aturan, dan kebijakan purna jual. AI akan mengacu ketat saat menjawab pertanyaan produk.', 'Petua: Tambah FAQ, peraturan dasar dan polisi selepas jualan. AI akan merujuk dengan ketat semasa menjawab soalan produk.', 'គន្លឹះ៖ បន្ថែម FAQ ច្បាប់កម្រិតក្រោម និងគោលនយោបាយក្រោយលក់។ AI នឹងយោងយ៉ាងតឹងរ៉ឹងពេលឆ្លើយសំណួរផលិតផល។'],
  'product.aiPlaceholder': ['例如：\nQ：能便宜吗？\nA：底价500，不能再低了，不包邮。\n\nQ：几成新？\nA：95新，屏幕无划痕，边框有一点小磕碰，已拍图。\n\n规则：售出不退换，看好再拍。', '例如：\nQ：能便宜嗎？\nA：底價 500，不能再低了，不包郵。\n\nQ：幾成新？\nA：95 新，螢幕無刮痕，邊框有一點小磕碰，已拍圖。\n\n規則：售出不退換，看好再拍。', 'Example:\nQ: Any discount?\nA: Lowest price is 500, no lower, shipping not included.\n\nQ: What condition?\nA: 95% new, no screen scratches, small frame marks, photos provided.\n\nRule: No returns after sale; confirm before buying.', 'Ví dụ:\nQ: Có giảm không?\nA: Giá thấp nhất 500, không giảm thêm, không freeship.\n\nQ: Mới bao nhiêu?\nA: 95%, màn không trầy, viền hơi cấn, đã có ảnh.\n\nQuy tắc: Đã bán không đổi trả, xem kỹ rồi mua.', 'ဥပမာ:\nQ: လျှော့ပေးနိုင်လား?\nA: အနိမ့်ဆုံး 500၊ ထပ်မလျှော့၊ ပို့ခမပါ။\n\nQ: အခြေအနေ?\nA: 95% အသစ်၊ စခရင်ခြစ်ရာမရှိ၊ ဘေးဘောင်အနည်းငယ်ထိ၊ ဓာတ်ပုံပါ။\n\nစည်းမျဉ်း: ရောင်းပြီးမပြန်မလဲ၊ သေချာကြည့်ပြီးဝယ်ပါ။', 'ตัวอย่าง:\nQ: ลดได้ไหม?\nA: ต่ำสุด 500 ลดไม่ได้แล้ว ไม่รวมค่าส่ง\n\nQ: สภาพกี่เปอร์เซ็นต์?\nA: 95% หน้าจอไม่มีรอย ขอบมีรอยเล็กน้อย มีรูปแล้ว\n\nกฎ: ขายแล้วไม่รับคืน โปรดตรวจให้ดีก่อนซื้อ', 'Contoh:\nQ: Bisa murah?\nA: Harga terendah 500, tidak bisa kurang, belum termasuk ongkir.\n\nQ: Kondisi berapa persen?\nA: 95% baru, layar tanpa gores, frame sedikit bekas, foto tersedia.\n\nAturan: Terjual tidak bisa retur, cek dulu sebelum beli.', 'Contoh:\nQ: Boleh murah?\nA: Harga terendah 500, tidak boleh kurang, tidak termasuk pos.\n\nQ: Keadaan berapa baru?\nA: 95% baru, skrin tiada calar, bingkai sedikit kesan, gambar ada.\n\nPeraturan: Dijual tidak boleh pulang/tukar, semak dahulu.', 'ឧទាហរណ៍៖\nQ: បញ្ចុះបានទេ?\nA: តម្លៃទាបបំផុត 500 មិនអាចទាបជាងនេះ មិនរួមថ្លៃដឹក។\n\nQ: ស្ថានភាពប៉ុន្មានភាគរយ?\nA: ថ្មី 95% អេក្រង់គ្មានស្នាម កោងមានស្នាមតិច មានរូប។\n\nច្បាប់៖ លក់ហើយមិនប្តូរ/សង សូមពិនិត្យមុនទិញ។'],
  'product.saveKnowledge': ['保存知识库', '儲存知識庫', 'Save Knowledge', 'Lưu kiến thức', 'ဗဟုသုတသိမ်း', 'บันทึกคลังความรู้', 'Simpan Pengetahuan', 'Simpan Pengetahuan', 'រក្សាទុកចំណេះដឹង'],
  'product.knowledgeSaved': ['AI专属知识库保存成功！', 'AI 專屬知識庫儲存成功！', 'AI knowledge saved successfully.', 'Đã lưu kho kiến thức AI.', 'AI ဗဟုသုတသိမ်းပြီးပါပြီ။', 'บันทึกคลังความรู้ AI สำเร็จ', 'Pengetahuan AI berhasil disimpan.', 'Pengetahuan AI berjaya disimpan.', 'បានរក្សាទុកចំណេះដឹង AI ដោយជោគជ័យ។'],
  'product.chooseAccountFirst': ['请先选择账号', '請先選擇帳號', 'Select an account first', 'Vui lòng chọn tài khoản trước', 'အကောင့်အရင်ရွေးပါ', 'โปรดเลือกบัญชีก่อน', 'Pilih akun dulu', 'Pilih akaun dahulu', 'សូមជ្រើសគណនីជាមុន'],
  'publish.title': ['发布商品', '發布商品', 'Publish Product', 'Đăng sản phẩm', 'ကုန်ပစ္စည်းတင်', 'ลงสินค้า', 'Terbitkan Produk', 'Terbit Produk', 'ផ្សព្វផ្សាយផលិតផល'],
  'publish.subtitle': ['填写商品信息并发布到鱼鱼平台', '填寫商品資訊並發布到魚魚平台', 'Fill product details and publish to Yuyu', 'Điền thông tin và đăng lên Yuyu', 'ကုန်ပစ္စည်းအချက်အလက်ဖြည့်ပြီး Yuyu သို့တင်ပါ', 'กรอกข้อมูลสินค้าและลงบน Yuyu', 'Isi detail produk dan terbitkan ke Yuyu', 'Isi butiran produk dan terbitkan ke Yuyu', 'បំពេញព័ត៌មានផលិតផល ហើយផ្សព្វផ្សាយទៅ Yuyu'],
  'publish.account': ['发布账号 *', '發布帳號 *', 'Publishing account *', 'Tài khoản đăng *', 'တင်မည့်အကောင့် *', 'บัญชีลงสินค้า *', 'Akun penerbit *', 'Akaun terbit *', 'គណនីផ្សព្វផ្សាយ *'],
  'publish.description': ['商品描述', '商品描述', 'Product description', 'Mô tả sản phẩm', 'ကုန်ပစ္စည်းဖော်ပြချက်', 'คำอธิบายสินค้า', 'Deskripsi produk', 'Huraian produk', 'ការពិពណ៌នាផលិតផល'],
  'publish.descriptionPlaceholder': ['详细描述商品的状态、配置、使用情况等...', '詳細描述商品的狀態、配置、使用情況等...', 'Describe condition, specs, usage, and details...', 'Mô tả chi tiết tình trạng, cấu hình, sử dụng...', 'အခြေအနေ၊ သတ်မှတ်ချက်၊ အသုံးပြုမှုအသေးစိတ်ရေးပါ...', 'อธิบายสภาพ สเปก การใช้งาน ฯลฯ...', 'Jelaskan kondisi, spesifikasi, penggunaan, dll...', 'Huraikan keadaan, spesifikasi, penggunaan, dll...', 'ពិពណ៌នាស្ថានភាព លក្ខណៈ បែបប្រើប្រាស់។ល។'],
  'publish.charCount': ['{{count}}/500 字符', '{{count}}/500 字元', '{{count}}/500 characters', '{{count}}/500 ký tự', '{{count}}/500 စာလုံး', '{{count}}/500 อักขระ', '{{count}}/500 karakter', '{{count}}/500 aksara', '{{count}}/500 តួអក្សរ'],
  'publish.price': ['售价 (元) *', '售價 (元) *', 'Sale price (CNY) *', 'Giá bán (CNY) *', 'ရောင်းဈေး (CNY) *', 'ราคาขาย (CNY) *', 'Harga jual (CNY) *', 'Harga jualan (CNY) *', 'តម្លៃលក់ (CNY) *'],
  'publish.originalPrice': ['原价 (元)', '原價 (元)', 'Original price (CNY)', 'Giá gốc (CNY)', 'မူရင်းဈေး (CNY)', 'ราคาเดิม (CNY)', 'Harga asli (CNY)', 'Harga asal (CNY)', 'តម្លៃដើម (CNY)'],
  'publish.stock': ['库存', '庫存', 'Stock', 'Tồn kho', 'လက်ကျန်', 'สต็อก', 'Stok', 'Stok', 'ស្តុក'],
  'publish.category': ['分类', '分類', 'Category', 'Danh mục', 'အမျိုးအစား', 'หมวดหมู่', 'Kategori', 'Kategori', 'ប្រភេទ'],
  'publish.categoryPlaceholder': ['例如：数码产品/手机/苹果', '例如：數位產品/手機/蘋果', 'Example: Electronics/Phones/Apple', 'Ví dụ: Điện tử/Điện thoại/Apple', 'ဥပမာ: အီလက်ထရောနစ်/ဖုန်း/Apple', 'เช่น อิเล็กทรอนิกส์/มือถือ/Apple', 'Contoh: Elektronik/HP/Apple', 'Contoh: Elektronik/Telefon/Apple', 'ឧទាហរណ៍៖ អេឡិចត្រូនិក/ទូរស័ព្ទ/Apple'],
  'publish.location': ['位置', '位置', 'Location', 'Vị trí', 'တည်နေရာ', 'ตำแหน่ง', 'Lokasi', 'Lokasi', 'ទីតាំង'],
  'publish.locationPlaceholder': ['例如：北京市/朝阳区', '例如：北京市/朝陽區', 'Example: Beijing/Chaoyang', 'Ví dụ: Bắc Kinh/Triều Dương', 'ဥပမာ: Beijing/Chaoyang', 'เช่น ปักกิ่ง/เฉาหยาง', 'Contoh: Beijing/Chaoyang', 'Contoh: Beijing/Chaoyang', 'ឧទាហរណ៍៖ Beijing/Chaoyang'],
  'publish.images': ['商品图片 * (最多9张)', '商品圖片 *（最多 9 張）', 'Product images * (up to 9)', 'Ảnh sản phẩm * (tối đa 9)', 'ကုန်ပစ္စည်းပုံ * (၉ ပုံအထိ)', 'รูปสินค้า * (สูงสุด 9)', 'Gambar produk * (maks 9)', 'Imej produk * (maks 9)', 'រូបផលិតផល * (អតិបរមា ៩)'],
  'publish.imageAlt': ['商品图片 {{index}}', '商品圖片 {{index}}', 'Product image {{index}}', 'Ảnh sản phẩm {{index}}', 'ကုန်ပစ္စည်းပုံ {{index}}', 'รูปสินค้า {{index}}', 'Gambar produk {{index}}', 'Imej produk {{index}}', 'រូបផលិតផល {{index}}'],
  'publish.uploadImage': ['上传图片', '上傳圖片', 'Upload image', 'Tải ảnh lên', 'ပုံတင်', 'อัปโหลดรูป', 'Unggah gambar', 'Muat naik imej', 'ផ្ទុករូបឡើង'],
  'publish.imageHelp': ['支持 JPG、PNG 格式，单张图片不超过 5MB', '支援 JPG、PNG 格式，單張圖片不超過 5MB', 'Supports JPG and PNG, max 5 MB per image', 'Hỗ trợ JPG, PNG, tối đa 5MB mỗi ảnh', 'JPG, PNG ထောက်ပံ့ပြီး တစ်ပုံလျှင် 5MB အထိ', 'รองรับ JPG, PNG ภาพละไม่เกิน 5MB', 'Mendukung JPG, PNG, maksimal 5MB per gambar', 'Menyokong JPG, PNG, maksimum 5MB setiap imej', 'គាំទ្រ JPG, PNG មិនលើស 5MB ក្នុងមួយរូប'],
  'publish.publishing': ['发布中...', '發布中...', 'Publishing...', 'Đang đăng...', 'တင်နေသည်...', 'กำลังลง...', 'Menerbitkan...', 'Sedang terbit...', 'កំពុងផ្សព្វផ្សាយ...'],
  'publish.submit': ['立即发布', '立即發布', 'Publish now', 'Đăng ngay', 'ယခုတင်', 'ลงทันที', 'Terbitkan sekarang', 'Terbit sekarang', 'ផ្សព្វផ្សាយឥឡូវ'],
  'publish.successTitle': ['发布成功', '發布成功', 'Published', 'Đăng thành công', 'တင်ပြီးပါပြီ', 'ลงสำเร็จ', 'Berhasil diterbitkan', 'Berjaya diterbitkan', 'បានផ្សព្វផ្សាយជោគជ័យ'],
  'publish.failedTitle': ['发布失败', '發布失敗', 'Publish failed', 'Đăng thất bại', 'တင်မှုမအောင်မြင်', 'ลงไม่สำเร็จ', 'Gagal menerbitkan', 'Gagal menerbitkan', 'ផ្សព្វផ្សាយបរាជ័យ'],
  'publish.successMessage': ['发布成功！', '發布成功！', 'Published successfully.', 'Đăng thành công.', 'တင်ပြီးပါပြီ။', 'ลงสำเร็จ', 'Berhasil diterbitkan.', 'Berjaya diterbitkan.', 'បានផ្សព្វផ្សាយដោយជោគជ័យ។'],
  'publish.failedMessage': ['发布失败，请重试', '發布失敗，請重試', 'Publish failed. Please retry.', 'Đăng thất bại, vui lòng thử lại.', 'တင်မှုမအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', 'ลงไม่สำเร็จ โปรดลองอีกครั้ง', 'Gagal menerbitkan, coba lagi.', 'Gagal menerbitkan, cuba lagi.', 'ផ្សព្វផ្សាយបរាជ័យ សូមព្យាយាមម្តងទៀត។'],
  'publish.uploadFailed': ['图片上传失败，请重试', '圖片上傳失敗，請重試', 'Image upload failed. Please retry.', 'Tải ảnh thất bại, vui lòng thử lại.', 'ပုံတင်မှုမအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။', 'อัปโหลดรูปไม่สำเร็จ โปรดลองอีกครั้ง', 'Gagal unggah gambar, coba lagi.', 'Gagal muat naik imej, cuba lagi.', 'ផ្ទុករូបបរាជ័យ សូមព្យាយាមម្តងទៀត។'],
  'publish.invalidPrice': ['请输入有效的价格', '請輸入有效價格', 'Enter a valid price', 'Nhập giá hợp lệ', 'မှန်ကန်သောဈေးနှုန်းထည့်ပါ', 'กรอกราคาที่ถูกต้อง', 'Masukkan harga valid', 'Masukkan harga sah', 'បញ្ចូលតម្លៃត្រឹមត្រូវ'],
  'publish.needImage': ['请至少上传一张商品图片', '請至少上傳一張商品圖片', 'Upload at least one product image', 'Tải lên ít nhất một ảnh sản phẩm', 'ကုန်ပစ္စည်းပုံ အနည်းဆုံးတစ်ပုံတင်ပါ', 'อัปโหลดรูปสินค้าอย่างน้อยหนึ่งรูป', 'Unggah setidaknya satu gambar produk', 'Muat naik sekurang-kurangnya satu imej produk', 'ផ្ទុករូបផលិតផលយ៉ាងហោចណាស់មួយ'],
  'batch.title': ['批量发布商品', '批次發布商品', 'Batch Publish Products', 'Đăng sản phẩm hàng loạt', 'ကုန်ပစ္စည်းအများအပြားတင်', 'ลงสินค้าจำนวนมาก', 'Terbitkan Produk Massal', 'Terbit Produk Pukal', 'ផ្សព្វផ្សាយផលិតផលជាបាច់'],
  'batch.subtitle': ['通过 CSV 文件批量导入并发布商品', '透過 CSV 檔批次匯入並發布商品', 'Import and publish products in bulk with a CSV file', 'Nhập và đăng hàng loạt bằng tệp CSV', 'CSV ဖိုင်ဖြင့် အများအပြားတင်သွင်းပြီးတင်ပါ', 'นำเข้าและลงสินค้าจำนวนมากด้วยไฟล์ CSV', 'Impor dan terbitkan produk massal via CSV', 'Import dan terbit produk secara pukal melalui CSV', 'នាំចូល និងផ្សព្វផ្សាយផលិតផលជាបាច់តាម CSV'],
  'batch.downloadTemplate': ['下载模板', '下載範本', 'Download Template', 'Tải mẫu', 'ပုံစံဒေါင်းလုဒ်', 'ดาวน์โหลดเทมเพลต', 'Unduh Template', 'Muat Turun Templat', 'ទាញយកគំរូ'],
  'batch.uploadCsv': ['上传 CSV 文件 *', '上傳 CSV 檔案 *', 'Upload CSV file *', 'Tải tệp CSV *', 'CSV ဖိုင်တင် *', 'อัปโหลดไฟล์ CSV *', 'Unggah file CSV *', 'Muat naik fail CSV *', 'ផ្ទុកឯកសារ CSV *'],
  'batch.chooseCsv': ['选择 CSV 文件', '選擇 CSV 檔案', 'Choose CSV file', 'Chọn tệp CSV', 'CSV ဖိုင်ရွေးပါ', 'เลือกไฟล์ CSV', 'Pilih file CSV', 'Pilih fail CSV', 'ជ្រើសរើសឯកសារ CSV'],
  'batch.csvHelpTitle': ['CSV 文件格式说明', 'CSV 檔案格式說明', 'CSV Format Guide', 'Hướng dẫn định dạng CSV', 'CSV ပုံစံလမ်းညွှန်', 'คำอธิบายรูปแบบ CSV', 'Panduan Format CSV', 'Panduan Format CSV', 'ណែនាំទ្រង់ទ្រាយ CSV'],
  'batch.csvHelpHeader': ['第一行为表头：title,description,price,images,category,location,original_price,stock', '第一列為表頭：title,description,price,images,category,location,original_price,stock', 'First row must be headers: title,description,price,images,category,location,original_price,stock', 'Dòng đầu là tiêu đề: title,description,price,images,category,location,original_price,stock', 'ပထမတန်းမှာ header ဖြစ်ရမည်: title,description,price,images,category,location,original_price,stock', 'แถวแรกต้องเป็นหัวตาราง: title,description,price,images,category,location,original_price,stock', 'Baris pertama harus header: title,description,price,images,category,location,original_price,stock', 'Baris pertama mesti pengepala: title,description,price,images,category,location,original_price,stock', 'ជួរដំបូងត្រូវជា header: title,description,price,images,category,location,original_price,stock'],
  'batch.csvHelpImages': ['images 字段使用 | 分隔多张图片路径', 'images 欄位使用 | 分隔多張圖片路徑', 'Use | to separate multiple image paths in images', 'Dùng | để tách nhiều đường dẫn ảnh trong images', 'images တွင် ပုံလမ်းကြောင်းများကို | ဖြင့်ခွဲပါ', 'ใช้ | แยกหลายพาธรูปใน images', 'Gunakan | untuk memisahkan path gambar di images', 'Gunakan | untuk memisahkan laluan imej dalam images', 'ប្រើ | ដើម្បីបំបែកផ្លូវរូបច្រើនក្នុង images'],
  'batch.csvHelpNumbers': ['price 和 original_price 为数字，stock 为整数', 'price 與 original_price 為數字，stock 為整數', 'price and original_price are numbers; stock is an integer', 'price và original_price là số, stock là số nguyên', 'price နှင့် original_price သည်ဂဏန်း၊ stock သည်ကိန်းပြည့်', 'price และ original_price เป็นตัวเลข stock เป็นจำนวนเต็ม', 'price dan original_price berupa angka, stock bilangan bulat', 'price dan original_price ialah nombor, stock integer', 'price និង original_price ជាលេខ, stock ជាចំនួនគត់'],
  'batch.csvHelpTemplate': ['建议先下载模板查看示例格式', '建議先下載範本查看範例格式', 'Download the template first to see examples', 'Nên tải mẫu để xem ví dụ', 'ဥပမာကြည့်ရန် ပုံစံကိုအရင်ဒေါင်းလုဒ်လုပ်ပါ', 'แนะนำให้ดาวน์โหลดเทมเพลตก่อนเพื่อดูตัวอย่าง', 'Sebaiknya unduh template untuk melihat contoh', 'Muat turun templat dahulu untuk melihat contoh', 'សូមទាញយកគំរូជាមុនដើម្បីមើលឧទាហរណ៍'],
  'batch.productList': ['商品列表 ({{count}} 个)', '商品清單（{{count}} 個）', 'Product List ({{count}})', 'Danh sách sản phẩm ({{count}})', 'ကုန်ပစ္စည်းစာရင်း ({{count}})', 'รายการสินค้า ({{count}})', 'Daftar Produk ({{count}})', 'Senarai Produk ({{count}})', 'បញ្ជីផលិតផល ({{count}})'],
  'batch.publishingProgress': ['发布中 {{current}}/{{total}}', '發布中 {{current}}/{{total}}', 'Publishing {{current}}/{{total}}', 'Đang đăng {{current}}/{{total}}', 'တင်နေသည် {{current}}/{{total}}', 'กำลังลง {{current}}/{{total}}', 'Menerbitkan {{current}}/{{total}}', 'Sedang terbit {{current}}/{{total}}', 'កំពុងផ្សព្វផ្សាយ {{current}}/{{total}}'],
  'batch.publish': ['批量发布', '批次發布', 'Batch Publish', 'Đăng hàng loạt', 'အများအပြားတင်', 'ลงจำนวนมาก', 'Terbit Massal', 'Terbit Pukal', 'ផ្សព្វផ្សាយជាបាច់'],
  'batch.table.title': ['标题', '標題', 'Title', 'Tiêu đề', 'ခေါင်းစဉ်', 'ชื่อ', 'Judul', 'Tajuk', 'ចំណងជើង'],
  'batch.table.price': ['价格', '價格', 'Price', 'Giá', 'ဈေးနှုန်း', 'ราคา', 'Harga', 'Harga', 'តម្លៃ'],
  'batch.table.images': ['图片', '圖片', 'Images', 'Ảnh', 'ပုံများ', 'รูปภาพ', 'Gambar', 'Imej', 'រូបភាព'],
  'batch.table.category': ['分类', '分類', 'Category', 'Danh mục', 'အမျိုးအစား', 'หมวดหมู่', 'Kategori', 'Kategori', 'ប្រភេទ'],
  'batch.imagesCount': ['{{count}} 张', '{{count}} 張', '{{count}} images', '{{count}} ảnh', '{{count}} ပုံ', '{{count}} รูป', '{{count}} gambar', '{{count}} imej', '{{count}} រូប'],
  'batch.resultTitle': ['发布结果', '發布結果', 'Publish Results', 'Kết quả đăng', 'တင်မှုရလဒ်', 'ผลการลง', 'Hasil Penerbitan', 'Keputusan Terbit', 'លទ្ធផលផ្សព្វផ្សាយ'],
  'batch.total': ['总数', '總數', 'Total', 'Tổng', 'စုစုပေါင်း', 'ทั้งหมด', 'Total', 'Jumlah', 'សរុប'],
  'batch.failedProducts': ['失败商品', '失敗商品', 'Failed Products', 'Sản phẩm thất bại', 'မအောင်မြင်သောကုန်ပစ္စည်း', 'สินค้าที่ล้มเหลว', 'Produk Gagal', 'Produk Gagal', 'ផលិតផលបរាជ័យ'],
  'batch.csvInvalid': ['CSV 文件格式错误', 'CSV 檔案格式錯誤', 'Invalid CSV file format', 'Định dạng CSV không đúng', 'CSV ဖိုင်ပုံစံမှားသည်', 'รูปแบบไฟล์ CSV ผิด', 'Format CSV salah', 'Format CSV tidak sah', 'ទ្រង់ទ្រាយ CSV មិនត្រឹមត្រូវ'],
  'batch.needProductData': ['请先上传商品数据', '請先上傳商品資料', 'Upload product data first', 'Vui lòng tải dữ liệu sản phẩm trước', 'ကုန်ပစ္စည်းဒေတာအရင်တင်ပါ', 'โปรดอัปโหลดข้อมูลสินค้าก่อน', 'Unggah data produk dulu', 'Muat naik data produk dahulu', 'សូមផ្ទុកទិន្នន័យផលិតផលជាមុន'],
  'batch.publishFailed': ['批量发布失败', '批次發布失敗', 'Batch publish failed', 'Đăng hàng loạt thất bại', 'အများအပြားတင်မှုမအောင်မြင်', 'ลงจำนวนมากไม่สำเร็จ', 'Terbit massal gagal', 'Terbit pukal gagal', 'ផ្សព្វផ្សាយជាបាច់បរាជ័យ'],
  'accounts.confirmDelete': ['确认删除该账号吗？', '確認刪除此帳號嗎？', 'Delete this account?', 'Xóa tài khoản này?', 'ဤအကောင့်ကိုဖျက်မလား?', 'ยืนยันลบบัญชีนี้หรือไม่?', 'Hapus akun ini?', 'Padam akaun ini?', 'លុបគណនីនេះឬ?'],
  'cards.title': ['卡密库存', '卡密庫存', 'Card Inventory', 'Kho thẻ', 'ကတ်လက်ကျန်', 'คลังคีย์การ์ด', 'Inventori Kartu', 'Inventori Kad', 'ស្តុកកាត'],
  'cards.subtitle': ['管理自动发货的卡密、链接或图片资源。', '管理自動發貨的卡密、連結或圖片資源。', 'Manage cards, links, or image resources used for auto delivery.', 'Quản lý thẻ, liên kết hoặc ảnh dùng cho giao hàng tự động.', 'အလိုအလျောက်ပို့ဆောင်ရန် ကတ်၊ link သို့မဟုတ် ပုံရင်းမြစ်များကိုစီမံပါ။', 'จัดการคีย์การ์ด ลิงก์ หรือรูปภาพสำหรับส่งอัตโนมัติ', 'Kelola kartu, tautan, atau gambar untuk pengiriman otomatis.', 'Urus kad, pautan atau imej untuk penghantaran automatik.', 'គ្រប់គ្រងកាត តំណ ឬរូបភាពសម្រាប់ដឹកជញ្ជូនស្វ័យប្រវត្តិ។'],
  'cards.addNew': ['添加新卡密', '新增卡密', 'Add New Card', 'Thêm thẻ mới', 'ကတ်အသစ်ထည့်', 'เพิ่มคีย์การ์ดใหม่', 'Tambah Kartu Baru', 'Tambah Kad Baharu', 'បន្ថែមកាតថ្មី'],
  'cards.name': ['卡密名称', '卡密名稱', 'Card name', 'Tên thẻ', 'ကတ်အမည်', 'ชื่อคีย์การ์ด', 'Nama kartu', 'Nama kad', 'ឈ្មោះកាត'],
  'cards.type': ['类型', '類型', 'Type', 'Loại', 'အမျိုးအစား', 'ประเภท', 'Tipe', 'Jenis', 'ប្រភេទ'],
  'cards.contentStock': ['内容/库存', '內容/庫存', 'Content / Stock', 'Nội dung / tồn kho', 'အကြောင်းအရာ / လက်ကျန်', 'เนื้อหา / สต็อก', 'Konten / Stok', 'Kandungan / Stok', 'មាតិកា / ស្តុក'],
  'cards.description': ['描述', '描述', 'Description', 'Mô tả', 'ဖော်ပြချက်', 'คำอธิบาย', 'Deskripsi', 'Huraian', 'ការពិពណ៌នា'],
  'cards.stockInfo': ['库存: {{count}} 条', '庫存：{{count}} 筆', 'Stock: {{count}} items', 'Tồn kho: {{count}} mục', 'လက်ကျန်: {{count}} ခု', 'สต็อก: {{count}} รายการ', 'Stok: {{count}} item', 'Stok: {{count}} item', 'ស្តុក៖ {{count}} ធាតុ'],
  'cards.imageLink': ['图片链接', '圖片連結', 'Image link', 'Liên kết ảnh', 'ပုံ link', 'ลิงก์รูปภาพ', 'Tautan gambar', 'Pautan imej', 'តំណរូបភាព'],
  'cards.typeText': ['文本', '文字', 'Text', 'Văn bản', 'စာသား', 'ข้อความ', 'Teks', 'Teks', 'អត្ថបទ'],
  'cards.typeData': ['批量', '批次', 'Batch', 'Hàng loạt', 'အစုလိုက်', 'ชุดข้อมูล', 'Batch', 'Pukal', 'ជាបាច់'],
  'cards.typeApi': ['API接口', 'API 介面', 'API endpoint', 'API', 'API endpoint', 'API', 'API', 'API', 'API'],
  'cards.typeImage': ['图片', '圖片', 'Image', 'Ảnh', 'ပုံ', 'รูปภาพ', 'Gambar', 'Imej', 'រូបភាព'],
  'cards.empty': ['暂无卡密配置，请点击右上角添加。', '暫無卡密設定，請點擊右上角新增。', 'No card configuration yet. Use the button above to add one.', 'Chưa có cấu hình thẻ. Nhấn nút phía trên để thêm.', 'ကတ်ဆက်တင်မရှိသေးပါ။ အပေါ်ဘက်ခလုတ်ဖြင့်ထည့်ပါ။', 'ยังไม่มีการตั้งค่าคีย์การ์ด กดปุ่มด้านบนเพื่อเพิ่ม', 'Belum ada konfigurasi kartu. Gunakan tombol di atas untuk menambah.', 'Tiada konfigurasi kad lagi. Gunakan butang di atas untuk menambah.', 'មិនទាន់មានការកំណត់កាត។ ប្រើប៊ូតុងខាងលើដើម្បីបន្ថែម។'],
  'cards.editTitle': ['编辑卡密', '編輯卡密', 'Edit Card', 'Sửa thẻ', 'ကတ်ပြင်', 'แก้ไขคีย์การ์ด', 'Edit Kartu', 'Edit Kad', 'កែសម្រួលកាត'],
  'cards.nameRequired': ['请输入卡密名称', '請輸入卡密名稱', 'Enter a card name', 'Nhập tên thẻ', 'ကတ်အမည်ထည့်ပါ', 'กรอกชื่อคีย์การ์ด', 'Masukkan nama kartu', 'Masukkan nama kad', 'បញ្ចូលឈ្មោះកាត'],
  'cards.typeRequired': ['请选择卡密类型', '請選擇卡密類型', 'Select a card type', 'Chọn loại thẻ', 'ကတ်အမျိုးအစားရွေးပါ', 'เลือกประเภทคีย์การ์ด', 'Pilih tipe kartu', 'Pilih jenis kad', 'ជ្រើសប្រភេទកាត'],
  'cards.confirmDelete': ['确认删除该卡密吗？', '確認刪除此卡密嗎？', 'Delete this card?', 'Xóa thẻ này?', 'ဤကတ်ကိုဖျက်မလား?', 'ยืนยันลบคีย์การ์ดนี้หรือไม่?', 'Hapus kartu ini?', 'Padam kad ini?', 'លុបកាតនេះឬ?'],
  'cards.namePlaceholder': ['例如：游戏点卡、会员卡等', '例如：遊戲點卡、會員卡等', 'Example: game card, membership card', 'Ví dụ: thẻ game, thẻ hội viên', 'ဥပမာ: game card, member card', 'เช่น บัตรเกม บัตรสมาชิก', 'Contoh: kartu game, kartu member', 'Contoh: kad permainan, kad ahli', 'ឧទាហរណ៍៖ កាតហ្គេម កាតសមាជិក'],
  'cards.selectType': ['请选择类型', '請選擇類型', 'Select a type', 'Chọn loại', 'အမျိုးအစားရွေးပါ', 'เลือกประเภท', 'Pilih tipe', 'Pilih jenis', 'ជ្រើសប្រភេទ'],
  'cards.fixedText': ['固定文字', '固定文字', 'Fixed text', 'Văn bản cố định', 'သတ်မှတ်စာသား', 'ข้อความคงที่', 'Teks tetap', 'Teks tetap', 'អត្ថបទថេរ'],
  'cards.batchData': ['批量数据', '批次資料', 'Batch data', 'Dữ liệu hàng loạt', 'အစုလိုက်ဒေတာ', 'ข้อมูลชุด', 'Data batch', 'Data pukal', 'ទិន្នន័យជាបាច់'],
  'cards.apiConfig': ['API 配置', 'API 設定', 'API Config', 'Cấu hình API', 'API ဆက်တင်', 'ตั้งค่า API', 'Konfigurasi API', 'Konfigurasi API', 'ការកំណត់ API'],
  'cards.apiUrl': ['API 地址', 'API 位址', 'API URL', 'Địa chỉ API', 'API URL', 'URL API', 'URL API', 'URL API', 'URL API'],
  'cards.requestMethod': ['请求方法', '請求方法', 'Request method', 'Phương thức yêu cầu', 'တောင်းဆိုမှုနည်းလမ်း', 'วิธีคำขอ', 'Metode request', 'Kaedah permintaan', 'វិធីសំណើ'],
  'cards.timeout': ['超时时间（秒）', '逾時時間（秒）', 'Timeout (seconds)', 'Thời gian chờ (giây)', 'Timeout (စက္ကန့်)', 'หมดเวลา (วินาที)', 'Timeout (detik)', 'Masa tamat (saat)', 'អស់ពេល (វិនាទី)'],
  'cards.headersJson': ['请求头（JSON 格式）', '請求標頭（JSON 格式）', 'Headers (JSON)', 'Header (JSON)', 'Headers (JSON)', 'Headers (JSON)', 'Header (JSON)', 'Header (JSON)', 'Headers (JSON)'],
  'cards.paramsJson': ['请求参数（JSON 格式）', '請求參數（JSON 格式）', 'Parameters (JSON)', 'Tham số (JSON)', 'Parameters (JSON)', 'พารามิเตอร์ (JSON)', 'Parameter (JSON)', 'Parameter (JSON)', 'ប៉ារ៉ាម៉ែត្រ (JSON)'],
  'cards.textConfig': ['固定文字配置', '固定文字設定', 'Fixed Text Config', 'Cấu hình văn bản cố định', 'သတ်မှတ်စာသားဆက်တင်', 'ตั้งค่าข้อความคงที่', 'Konfigurasi Teks Tetap', 'Konfigurasi Teks Tetap', 'ការកំណត់អត្ថបទថេរ'],
  'cards.textContent': ['文字内容', '文字內容', 'Text content', 'Nội dung văn bản', 'စာသားအကြောင်းအရာ', 'เนื้อหาข้อความ', 'Isi teks', 'Kandungan teks', 'មាតិកាអត្ថបទ'],
  'cards.textPlaceholder': ['请输入要发送的固定文字内容...', '請輸入要發送的固定文字內容...', 'Enter the fixed text to send...', 'Nhập nội dung cố định cần gửi...', 'ပို့မည့်သတ်မှတ်စာသားထည့်ပါ...', 'กรอกข้อความคงที่ที่จะส่ง...', 'Masukkan teks tetap yang akan dikirim...', 'Masukkan teks tetap untuk dihantar...', 'បញ្ចូលអត្ថបទថេរដែលត្រូវផ្ញើ...'],
  'cards.dataConfig': ['批量数据配置', '批次資料設定', 'Batch Data Config', 'Cấu hình dữ liệu hàng loạt', 'အစုလိုက်ဒေတာဆက်တင်', 'ตั้งค่าข้อมูลชุด', 'Konfigurasi Data Batch', 'Konfigurasi Data Pukal', 'ការកំណត់ទិន្នន័យជាបាច់'],
  'cards.dataContent': ['数据内容（一行一个）', '資料內容（一行一筆）', 'Data content (one per line)', 'Dữ liệu (mỗi dòng một mục)', 'ဒေတာအကြောင်းအရာ (တစ်ကြောင်းတစ်ခု)', 'ข้อมูล (บรรทัดละหนึ่ง)', 'Isi data (satu per baris)', 'Kandungan data (satu setiap baris)', 'មាតិកាទិន្នន័យ (មួយក្នុងមួយបន្ទាត់)'],
  'cards.dataPlaceholder': ['请输入数据，每行一个：\n卡号1:密码1\n卡号2:密码2\n或者\n兑换码1\n兑换码2', '請輸入資料，每行一筆：\n卡號1:密碼1\n卡號2:密碼2\n或\n兌換碼1\n兌換碼2', 'Enter data, one per line:\nCard1:Password1\nCard2:Password2\nor\nCode1\nCode2', 'Nhập dữ liệu, mỗi dòng một mục:\nThẻ1:Mật khẩu1\nThẻ2:Mật khẩu2\nhoặc\nMã1\nMã2', 'ဒေတာကို တစ်ကြောင်းတစ်ခုထည့်ပါ:\nCard1:Password1\nCard2:Password2\nသို့မဟုတ်\nCode1\nCode2', 'กรอกข้อมูลบรรทัดละหนึ่ง:\nCard1:Password1\nCard2:Password2\nหรือ\nCode1\nCode2', 'Masukkan data, satu per baris:\nKartu1:Password1\nKartu2:Password2\natau\nKode1\nKode2', 'Masukkan data, satu setiap baris:\nKad1:KataLaluan1\nKad2:KataLaluan2\natau\nKod1\nKod2', 'បញ្ចូលទិន្នន័យ មួយបន្ទាត់មួយ៖\nCard1:Password1\nCard2:Password2\nឬ\nCode1\nCode2'],
  'cards.dataFormatHelp': ['支持格式：卡号:密码 或 单独的兑换码', '支援格式：卡號:密碼 或單獨兌換碼', 'Supported: card:password or standalone code', 'Hỗ trợ: thẻ:mật khẩu hoặc mã riêng', 'ထောက်ပံ့: card:password သို့မဟုတ် code တစ်ခုတည်း', 'รองรับ: card:password หรือรหัสเดี่ยว', 'Didukung: kartu:password atau kode tunggal', 'Disokong: kad:kata laluan atau kod tunggal', 'គាំទ្រ៖ card:password ឬ code ដាច់ដោយឡែក'],
  'cards.currentStock': ['当前库存：', '目前庫存：', 'Current stock: ', 'Tồn kho hiện tại: ', 'လက်ရှိလက်ကျန်: ', 'สต็อกปัจจุบัน: ', 'Stok saat ini: ', 'Stok semasa: ', 'ស្តុកបច្ចុប្បន្ន៖ '],
  'cards.imageConfig': ['图片配置', '圖片設定', 'Image Config', 'Cấu hình ảnh', 'ပုံဆက်တင်', 'ตั้งค่ารูปภาพ', 'Konfigurasi Gambar', 'Konfigurasi Imej', 'ការកំណត់រូបភាព'],
  'cards.imageUrl': ['图片 URL', '圖片 URL', 'Image URL', 'URL ảnh', 'ပုံ URL', 'URL รูปภาพ', 'URL gambar', 'URL imej', 'URL រូបភាព'],
  'cards.imageUrlHelp': ['输入图片卡密的 URL 地址', '輸入圖片卡密的 URL 位址', 'Enter the image card URL', 'Nhập URL ảnh thẻ', 'ပုံကတ် URL ထည့်ပါ', 'กรอก URL รูปคีย์การ์ด', 'Masukkan URL kartu gambar', 'Masukkan URL kad imej', 'បញ្ចូល URL រូបភាពកាត'],
  'cards.preview': ['图片预览', '圖片預覽', 'Image preview', 'Xem trước ảnh', 'ပုံကြိုကြည့်', 'ตัวอย่างรูปภาพ', 'Pratinjau gambar', 'Pratonton imej', 'មើលរូបភាពជាមុន'],
  'cards.delay': ['延时发货时间（秒）', '延遲發貨時間（秒）', 'Delivery delay (seconds)', 'Trễ giao hàng (giây)', 'ပို့ရန်နောက်ကျချိန် (စက္ကန့်)', 'หน่วงเวลาจัดส่ง (วินาที)', 'Tunda pengiriman (detik)', 'Lengah penghantaran (saat)', 'ពន្យាពេលដឹកជញ្ជូន (វិនាទី)'],
  'cards.delayHelp': ['0表示立即发货，最大3600秒（1小时）', '0 表示立即發貨，最大 3600 秒（1 小時）', '0 means immediate delivery, max 3600 seconds (1 hour)', '0 là giao ngay, tối đa 3600 giây (1 giờ)', '0 သည်ချက်ချင်းပို့ခြင်း၊ အများဆုံး 3600 စက္ကန့် (၁ နာရီ)', '0 คือส่งทันที สูงสุด 3600 วินาที (1 ชั่วโมง)', '0 berarti kirim langsung, maks 3600 detik (1 jam)', '0 bermaksud hantar segera, maks 3600 saat (1 jam)', '0 មានន័យថាដឹកជញ្ជូនភ្លាម អតិបរមា 3600 វិនាទី (1 ម៉ោង)'],
  'cards.note': ['备注信息', '備註資訊', 'Notes', 'Ghi chú', 'မှတ်ချက်', 'หมายเหตุ', 'Catatan', 'Nota', 'កំណត់ចំណាំ'],
  'cards.notePlaceholder': ['可选的备注信息', '選填備註資訊', 'Optional notes', 'Ghi chú tùy chọn', 'ရွေးချယ်နိုင်သောမှတ်ချက်', 'หมายเหตุ (ไม่บังคับ)', 'Catatan opsional', 'Nota pilihan', 'កំណត់ចំណាំស្រេចចិត្ត'],
  'cards.multiSpec': ['多规格卡券', '多規格卡券', 'Multi-spec card', 'Thẻ nhiều quy cách', 'သတ်မှတ်ချက်များစွာကတ်', 'คีย์การ์ดหลายสเปก', 'Kartu multi-spesifikasi', 'Kad berbilang spesifikasi', 'កាតច្រើនលក្ខណៈ'],
  'cards.multiSpecHelp': ['开启后可以为同一商品的不同规格创建不同的卡券', '開啟後可為同一商品的不同規格建立不同卡券', 'When enabled, create different cards for product variants.', 'Bật để tạo thẻ khác nhau cho các quy cách sản phẩm.', 'ဖွင့်ပါက ကုန်ပစ္စည်းမျိုးကွဲအတွက် ကတ်အမျိုးမျိုးဖန်တီးနိုင်သည်။', 'เปิดแล้วสร้างคีย์การ์ดต่างกันสำหรับสเปกต่างๆ ของสินค้าเดียวกัน', 'Jika aktif, buat kartu berbeda untuk varian produk.', 'Jika aktif, cipta kad berbeza untuk varian produk.', 'បើបើក អាចបង្កើតកាតខុសៗគ្នាសម្រាប់លក្ខណៈផលិតផលផ្សេងៗ។'],
  'cards.specName': ['规格名称', '規格名稱', 'Spec name', 'Tên quy cách', 'သတ်မှတ်ချက်အမည်', 'ชื่อสเปก', 'Nama spesifikasi', 'Nama spesifikasi', 'ឈ្មោះលក្ខណៈ'],
  'cards.specNamePlaceholder': ['例如：套餐类型、颜色、尺寸', '例如：套餐類型、顏色、尺寸', 'Example: plan, color, size', 'Ví dụ: gói, màu, kích thước', 'ဥပမာ: package, color, size', 'เช่น แพ็กเกจ สี ขนาด', 'Contoh: paket, warna, ukuran', 'Contoh: pakej, warna, saiz', 'ឧទាហរណ៍៖ កញ្ចប់ ពណ៌ ទំហំ'],
  'cards.specValue': ['规格值', '規格值', 'Spec value', 'Giá trị quy cách', 'သတ်မှတ်ချက်တန်ဖိုး', 'ค่าสเปก', 'Nilai spesifikasi', 'Nilai spesifikasi', 'តម្លៃលក្ខណៈ'],
  'cards.specValuePlaceholder': ['例如：30天、红色、XL', '例如：30 天、紅色、XL', 'Example: 30 days, red, XL', 'Ví dụ: 30 ngày, đỏ, XL', 'ဥပမာ: 30 ရက်၊ အနီ၊ XL', 'เช่น 30 วัน สีแดง XL', 'Contoh: 30 hari, merah, XL', 'Contoh: 30 hari, merah, XL', 'ឧទាហរណ៍៖ 30 ថ្ងៃ ក្រហម XL'],
  'cards.enabledStatus': ['启用状态', '啟用狀態', 'Enabled status', 'Trạng thái bật', 'ဖွင့်ထားမှု', 'สถานะเปิดใช้งาน', 'Status aktif', 'Status aktif', 'ស្ថានភាពបើក'],
  'cards.saveChanges': ['保存更改', '儲存變更', 'Save Changes', 'Lưu thay đổi', 'ပြောင်းလဲမှုသိမ်း', 'บันทึกการเปลี่ยนแปลง', 'Simpan Perubahan', 'Simpan Perubahan', 'រក្សាទុកការផ្លាស់ប្តូរ'],
  'cards.addTitle': ['添加新卡密', '新增卡密', 'Add New Card', 'Thêm thẻ mới', 'ကတ်အသစ်ထည့်', 'เพิ่มคีย์การ์ดใหม่', 'Tambah Kartu Baru', 'Tambah Kad Baharu', 'បន្ថែមកាតថ្មី'],
  'cards.contentTextLabel': ['卡密内容（一行一个）', '卡密內容（一行一筆）', 'Card content (one per line)', 'Nội dung thẻ (mỗi dòng một mục)', 'ကတ်အကြောင်းအရာ (တစ်ကြောင်းတစ်ခု)', 'คีย์การ์ด (บรรทัดละหนึ่ง)', 'Konten kartu (satu per baris)', 'Kandungan kad (satu setiap baris)', 'មាតិកាកាត (មួយក្នុងមួយបន្ទាត់)'],
  'cards.imageUrlLineLabel': ['图片URL（一行一个）', '圖片 URL（一行一筆）', 'Image URL (one per line)', 'URL ảnh (mỗi dòng một mục)', 'ပုံ URL (တစ်ကြောင်းတစ်ခု)', 'URL รูปภาพ (บรรทัดละหนึ่ง)', 'URL gambar (satu per baris)', 'URL imej (satu setiap baris)', 'URL រូបភាព (មួយក្នុងមួយបន្ទាត់)'],
  'cards.descriptionPlaceholder': ['卡密用途描述', '卡密用途描述', 'Describe what this card is for', 'Mô tả mục đích thẻ', 'ကတ်အသုံးပြုပုံဖော်ပြ', 'อธิบายการใช้งานคีย์การ์ด', 'Deskripsi penggunaan kartu', 'Huraian kegunaan kad', 'ពិពណ៌នាគោលបំណងកាត'],
  'conversations.title': ['聊天记录', '聊天記錄', 'Conversations', 'Hội thoại', 'စကားပြောမှတ်တမ်း', 'ประวัติแชท', 'Percakapan', 'Perbualan', 'ការសន្ទនា'],
  'conversations.subtitle': ['点开会话只读取后端已保存记录；需要补历史时点右上角后台同步。', '點開會話只讀取後端已儲存記錄；需要補歷史時點右上角背景同步。', 'Opening a chat reads saved backend records only. Use background sync to backfill history.', 'Mở hội thoại chỉ đọc bản ghi đã lưu; dùng đồng bộ nền để bổ sung lịch sử.', 'စကားပြောဖွင့်လျှင် backend သိမ်းထားသောမှတ်တမ်းကိုသာဖတ်သည်။ သမိုင်းဖြည့်ရန် background sync သုံးပါ။', 'เปิดแชทจะอ่านเฉพาะบันทึกที่บันทึกไว้ ใช้ซิงค์เบื้องหลังเพื่อเติมประวัติ', 'Membuka chat hanya membaca catatan backend tersimpan. Gunakan sinkron latar untuk melengkapi riwayat.', 'Membuka chat hanya membaca rekod backend tersimpan. Gunakan segerak latar untuk mengisi sejarah.', 'បើកការសន្ទនា នឹងអានតែកំណត់ត្រាដែល backend បានរក្សាទុក។ ប្រើសមកាលកម្មផ្ទៃក្រោយដើម្បីបំពេញប្រវត្តិ។'],
  'conversations.searchPlaceholder': ['搜索买家、商品、会话或最近一条消息...', '搜尋買家、商品、會話或最近一則訊息...', 'Search buyer, product, chat, or latest message...', 'Tìm người mua, sản phẩm, hội thoại hoặc tin mới nhất...', 'ဝယ်သူ၊ ကုန်ပစ္စည်း၊ chat သို့မဟုတ် နောက်ဆုံးစာရှာ...', 'ค้นหาผู้ซื้อ/สินค้า/แชท/ข้อความล่าสุด...', 'Cari pembeli, produk, chat, atau pesan terbaru...', 'Cari pembeli, produk, chat, atau mesej terbaru...', 'ស្វែងរកអ្នកទិញ ផលិតផល ការសន្ទនា ឬសារចុងក្រោយ...'],
  'conversations.allAccounts': ['全部账号（按账号分组）', '全部帳號（依帳號分組）', 'All accounts (grouped)', 'Tất cả tài khoản (nhóm theo tài khoản)', 'အကောင့်အားလုံး (အုပ်စုလိုက်)', 'ทุกบัญชี (จัดกลุ่มตามบัญชี)', 'Semua akun (dikelompokkan)', 'Semua akaun (dikumpulkan)', 'គណនីទាំងអស់ (ជាក្រុម)'],
  'conversations.derived': ['（聊天派生）', '（聊天衍生）', '(chat-derived)', '(từ hội thoại)', '(chat မှ)', '(มาจากแชท)', '(turunan chat)', '(terbitan chat)', '(បានមកពីការសន្ទនា)'],
  'conversations.backgroundSync': ['后台同步', '背景同步', 'Background Sync', 'Đồng bộ nền', 'နောက်ခံစင့်ခ်', 'ซิงค์เบื้องหลัง', 'Sinkron Latar', 'Segerak Latar', 'សមកាលកម្មផ្ទៃក្រោយ'],
  'conversations.total': ['共 {{count}} 个会话', '共 {{count}} 個會話', '{{count}} chats total', 'Tổng {{count}} hội thoại', 'စုစုပေါင်း chat {{count}} ခု', 'ทั้งหมด {{count}} แชท', 'Total {{count}} chat', 'Jumlah {{count}} perbualan', 'សរុប {{count}} ការសន្ទនា'],
  'conversations.currentAccount': ['当前账号：{{name}}', '目前帳號：{{name}}', 'Current account: {{name}}', 'Tài khoản hiện tại: {{name}}', 'လက်ရှိအကောင့်: {{name}}', 'บัญชีปัจจุบัน: {{name}}', 'Akun saat ini: {{name}}', 'Akaun semasa: {{name}}', 'គណនីបច្ចុប្បន្ន៖ {{name}}'],
  'conversations.searchingPage': ['本页搜索中', '本頁搜尋中', 'Searching this page', 'Đang tìm trong trang này', 'ဤစာမျက်နှာတွင်ရှာနေ', 'กำลังค้นหาในหน้านี้', 'Mencari di halaman ini', 'Mencari dalam halaman ini', 'កំពុងស្វែងរកទំព័រនេះ'],
  'conversations.listTitle': ['会话列表', '會話清單', 'Chat List', 'Danh sách hội thoại', 'Chat စာရင်း', 'รายการแชท', 'Daftar Chat', 'Senarai Perbualan', 'បញ្ជីសន្ទនា'],
  'conversations.listHint': ['点击左侧用户查看完整对话', '點擊左側使用者查看完整對話', 'Click a user on the left to view the full conversation', 'Nhấn người dùng bên trái để xem toàn bộ hội thoại', 'ဘယ်ဘက်အသုံးပြုသူကိုနှိပ်ပြီး စကားပြောအပြည့်ကြည့်ပါ', 'คลิกผู้ใช้ด้านซ้ายเพื่อดูบทสนทนาทั้งหมด', 'Klik pengguna di kiri untuk melihat percakapan penuh', 'Klik pengguna di kiri untuk melihat perbualan penuh', 'ចុចអ្នកប្រើខាងឆ្វេង ដើម្បីមើលការសន្ទនាពេញលេញ'],
  'conversations.noMatch': ['本页没有匹配的会话', '本頁沒有符合的會話', 'No matching chats on this page', 'Không có hội thoại khớp trong trang này', 'ဤစာမျက်နှာတွင် ကိုက်ညီသော chat မရှိ', 'ไม่มีแชทที่ตรงในหน้านี้', 'Tidak ada chat cocok di halaman ini', 'Tiada perbualan sepadan dalam halaman ini', 'គ្មានការសន្ទនាដែលត្រូវគ្នានៅទំព័រនេះ'],
  'conversations.empty': ['暂无聊天会话', '暫無聊天會話', 'No chats yet', 'Chưa có hội thoại', 'chat မရှိသေးပါ', 'ยังไม่มีแชท', 'Belum ada chat', 'Tiada perbualan lagi', 'មិនទាន់មានការសន្ទនា'],
  'conversations.noContent': ['暂无消息内容', '暫無訊息內容', 'No message content', 'Chưa có nội dung tin nhắn', 'စာအကြောင်းအရာမရှိ', 'ยังไม่มีข้อความ', 'Tidak ada isi pesan', 'Tiada kandungan mesej', 'គ្មានមាតិកាសារ'],
  'conversations.messageCount': ['共 {{count}} 条', '共 {{count}} 則', '{{count}} messages', '{{count}} tin nhắn', 'စာ {{count}} စောင်', '{{count}} ข้อความ', '{{count}} pesan', '{{count}} mesej', '{{count}} សារ'],
  'conversations.ourRoleCount': ['我方{{role}} {{count}}', '我方{{role}} {{count}}', 'Our {{role}} {{count}}', 'Bên ta {{role}} {{count}}', 'ကျွန်ုပ်တို့ {{role}} {{count}}', 'ฝ่ายเรา {{role}} {{count}}', 'Pihak kami {{role}} {{count}}', 'Pihak kami {{role}} {{count}}', 'ភាគីយើង {{role}} {{count}}'],
  'conversations.productTag': ['商品 {{id}}', '商品 {{id}}', 'Product {{id}}', 'Sản phẩm {{id}}', 'ကုန်ပစ္စည်း {{id}}', 'สินค้า {{id}}', 'Produk {{id}}', 'Produk {{id}}', 'ផលិតផល {{id}}'],
  'conversations.selectChat': ['请选择左侧会话', '請選擇左側會話', 'Select a chat on the left', 'Chọn hội thoại bên trái', 'ဘယ်ဘက် chat ကိုရွေးပါ', 'เลือกแชทด้านซ้าย', 'Pilih chat di kiri', 'Pilih perbualan di kiri', 'ជ្រើសការសន្ទនាខាងឆ្វេង'],
  'conversations.chatId': ['会话ID：{{id}}', '會話 ID：{{id}}', 'Chat ID: {{id}}', 'ID hội thoại: {{id}}', 'Chat ID: {{id}}', 'ID แชท: {{id}}', 'ID Chat: {{id}}', 'ID Perbualan: {{id}}', 'លេខសម្គាល់សន្ទនា៖ {{id}}'],
  'conversations.accountLabel': ['账号：{{name}}', '帳號：{{name}}', 'Account: {{name}}', 'Tài khoản: {{name}}', 'အကောင့်: {{name}}', 'บัญชี: {{name}}', 'Akun: {{name}}', 'Akaun: {{name}}', 'គណនី៖ {{name}}'],
  'conversations.ourIdentity': ['我方身份：{{role}}', '我方身分：{{role}}', 'Our role: {{role}}', 'Vai trò bên ta: {{role}}', 'ကျွန်ုပ်တို့ အခန်းကဏ္ဍ: {{role}}', 'บทบาทฝ่ายเรา: {{role}}', 'Peran kami: {{role}}', 'Peranan kami: {{role}}', 'តួនាទីយើង៖ {{role}}'],
  'conversations.scene': ['场景：{{scene}}', '場景：{{scene}}', 'Scene: {{scene}}', 'Ngữ cảnh: {{scene}}', 'အခြေအနေ: {{scene}}', 'สถานการณ์: {{scene}}', 'Skenario: {{scene}}', 'Senario: {{scene}}', 'បរិបទ៖ {{scene}}'],
  'conversations.messagesLabel': ['消息数：{{count}}', '訊息數：{{count}}', 'Messages: {{count}}', 'Số tin: {{count}}', 'စာအရေအတွက်: {{count}}', 'จำนวนข้อความ: {{count}}', 'Pesan: {{count}}', 'Mesej: {{count}}', 'ចំនួនសារ៖ {{count}}'],
  'conversations.productLabel': ['商品：{{id}}', '商品：{{id}}', 'Product: {{id}}', 'Sản phẩm: {{id}}', 'ကုန်ပစ္စည်း: {{id}}', 'สินค้า: {{id}}', 'Produk: {{id}}', 'Produk: {{id}}', 'ផលិតផល៖ {{id}}'],
  'conversations.emptyThread': ['当前会话暂无消息', '目前會話暫無訊息', 'No messages in this chat', 'Hội thoại này chưa có tin nhắn', 'ဤ chat တွင်စာမရှိသေးပါ', 'แชทนี้ยังไม่มีข้อความ', 'Belum ada pesan di chat ini', 'Tiada mesej dalam perbualan ini', 'ការសន្ទនានេះមិនទាន់មានសារ'],
  'conversations.ourMessage': ['我方{{role}}', '我方{{role}}', 'Our {{role}}', 'Bên ta {{role}}', 'ကျွန်ုပ်တို့ {{role}}', 'ฝ่ายเรา {{role}}', 'Pihak kami {{role}}', 'Pihak kami {{role}}', 'ភាគីយើង {{role}}'],
  'conversations.counterpartMessage': ['{{role}}消息', '{{role}}訊息', '{{role}} message', 'Tin nhắn {{role}}', '{{role}} စာ', 'ข้อความ{{role}}', 'Pesan {{role}}', 'Mesej {{role}}', 'សារ{{role}}'],
  'conversations.intent': ['意图：{{intent}}', '意圖：{{intent}}', 'Intent: {{intent}}', 'Ý định: {{intent}}', 'ရည်ရွယ်ချက်: {{intent}}', 'เจตนา: {{intent}}', 'Niat: {{intent}}', 'Niat: {{intent}}', 'បំណង៖ {{intent}}'],
  'conversations.bargainCount': ['议价次数：{{count}}', '議價次數：{{count}}', 'Bargains: {{count}}', 'Số lần trả giá: {{count}}', 'ဈေးညှိအကြိမ်: {{count}}', 'จำนวนครั้งต่อรอง: {{count}}', 'Jumlah tawar: {{count}}', 'Bilangan tawar-menawar: {{count}}', 'ចំនួនចរចា៖ {{count}}'],
  'conversations.firstMessage': ['首次消息：{{time}}', '首次訊息：{{time}}', 'First message: {{time}}', 'Tin đầu: {{time}}', 'ပထမစာ: {{time}}', 'ข้อความแรก: {{time}}', 'Pesan pertama: {{time}}', 'Mesej pertama: {{time}}', 'សារដំបូង៖ {{time}}'],
  'conversations.lastMessage': ['最后消息：{{time}}', '最後訊息：{{time}}', 'Last message: {{time}}', 'Tin cuối: {{time}}', 'နောက်ဆုံးစာ: {{time}}', 'ข้อความล่าสุด: {{time}}', 'Pesan terakhir: {{time}}', 'Mesej terakhir: {{time}}', 'សារចុងក្រោយ៖ {{time}}'],
  'conversations.role.seller': ['卖家', '賣家', 'Seller', 'Người bán', 'ရောင်းသူ', 'ผู้ขาย', 'Penjual', 'Penjual', 'អ្នកលក់'],
  'conversations.role.buyer': ['买家', '買家', 'Buyer', 'Người mua', 'ဝယ်သူ', 'ผู้ซื้อ', 'Pembeli', 'Pembeli', 'អ្នកទិញ'],
  'conversations.unknownUser': ['未知用户', '未知使用者', 'Unknown user', 'Người dùng không rõ', 'မသိသောအသုံးပြုသူ', 'ผู้ใช้ไม่ทราบ', 'Pengguna tidak dikenal', 'Pengguna tidak diketahui', 'អ្នកប្រើមិនស្គាល់'],
  'conversations.unknownRole': ['未知{{role}}', '未知{{role}}', 'Unknown {{role}}', '{{role}} không rõ', 'မသိသော {{role}}', '{{role}}ไม่ทราบ', '{{role}} tidak dikenal', '{{role}} tidak diketahui', '{{role}}មិនស្គាល់'],
  'conversations.chatFallback': ['会话 {{id}}', '會話 {{id}}', 'Chat {{id}}', 'Hội thoại {{id}}', 'Chat {{id}}', 'แชท {{id}}', 'Chat {{id}}', 'Perbualan {{id}}', 'ការសន្ទនា {{id}}'],
  'conversations.marketScene': ['调研沟通', '調研溝通', 'Research chat', 'Trao đổi nghiên cứu', 'သုတေသနဆက်သွယ်မှု', 'แชทวิจัย', 'Chat riset', 'Perbualan kajian', 'ការសន្ទនាស្រាវជ្រាវ'],
  'conversations.buyerScene': ['买家沟通', '買家溝通', 'Buyer chat', 'Trao đổi người mua', 'ဝယ်သူဆက်သွယ်မှု', 'แชทผู้ซื้อ', 'Chat pembeli', 'Perbualan pembeli', 'ការសន្ទនាអ្នកទិញ'],
  'conversations.sellerScene': ['售卖会话', '銷售會話', 'Selling chat', 'Hội thoại bán hàng', 'ရောင်းချ chat', 'แชทขาย', 'Chat penjualan', 'Perbualan jualan', 'ការសន្ទនាលក់'],
  'conversations.syncTriggered': ['已在后台补同步聊天记录，几秒后会自动刷新。', '已在背景補同步聊天記錄，幾秒後會自動重新整理。', 'Chat history is syncing in the background and will refresh shortly.', 'Lịch sử chat đang đồng bộ nền và sẽ tự làm mới sau vài giây.', 'Chat သမိုင်းကို နောက်ခံတွင်စင့်ခ်နေပြီး မကြာမီ refresh ဖြစ်မည်။', 'กำลังซิงค์ประวัติแชทเบื้องหลัง และจะรีเฟรชในไม่กี่วินาที', 'Riwayat chat sedang disinkronkan di latar dan akan segera segar.', 'Sejarah chat sedang disegerak di latar dan akan segar semula sebentar lagi.', 'ប្រវត្តិសន្ទនាកំពុងសមកាលកម្មផ្ទៃក្រោយ ហើយនឹងធ្វើឱ្យស្រស់ឆាប់ៗ។'],
  'conversations.noSyncTask': ['当前先读取本地记录，暂无新的后台补同步任务。', '目前先讀取本機記錄，暫無新的背景補同步任務。', 'Reading local records for now. No new background backfill task.', 'Đang đọc bản ghi cục bộ. Chưa có tác vụ đồng bộ nền mới.', 'ယခု local မှတ်တမ်းကိုဖတ်နေသည်။ နောက်ခံဖြည့်စင့်ခ်အလုပ်အသစ်မရှိပါ။', 'อ่านบันทึกในเครื่องก่อน ยังไม่มีงานซิงค์เบื้องหลังใหม่', 'Membaca catatan lokal. Belum ada tugas backfill latar baru.', 'Membaca rekod tempatan. Tiada tugas isi semula latar baharu.', 'កំពុងអានកំណត់ត្រាមូលដ្ឋាន។ មិនមានកិច្ចការសមកាលកម្មផ្ទៃក្រោយថ្មីទេ។'],
  'conversations.loadAccountsFailed': ['获取账号列表失败', '取得帳號清單失敗', 'Failed to load accounts', 'Tải danh sách tài khoản thất bại', 'အကောင့်စာရင်းဖွင့်မရ', 'โหลดรายการบัญชีไม่สำเร็จ', 'Gagal memuat akun', 'Gagal memuat akaun', 'ទាញយកបញ្ជីគណនីបរាជ័យ'],
  'conversations.loadSessionsFailed': ['获取聊天会话失败', '取得聊天會話失敗', 'Failed to load chats', 'Tải hội thoại thất bại', 'Chat ဖွင့်မရ', 'โหลดแชทไม่สำเร็จ', 'Gagal memuat chat', 'Gagal memuat perbualan', 'ទាញយកការសន្ទនាបរាជ័យ'],
  'conversations.loadThreadFailed': ['获取聊天详情失败', '取得聊天詳情失敗', 'Failed to load chat details', 'Tải chi tiết hội thoại thất bại', 'Chat အသေးစိတ်ဖွင့်မရ', 'โหลดรายละเอียดแชทไม่สำเร็จ', 'Gagal memuat detail chat', 'Gagal memuat butiran perbualan', 'ទាញយកលម្អិតការសន្ទនាបរាជ័យ'],
  'settings.title': ['系统设置', '系統設定', 'System Settings', 'Cài đặt hệ thống', 'စနစ်ဆက်တင်', 'ตั้งค่าระบบ', 'Pengaturan Sistem', 'Tetapan Sistem', 'ការកំណត់ប្រព័ន្ធ'],
  'settings.subtitle': ['配置全局自动化规则与系统参数', '設定全域自動化規則與系統參數', 'Configure global automation rules and system parameters', 'Cấu hình quy tắc tự động và tham số hệ thống', 'ကမ္ဘာလုံးဆိုင်ရာ automation စည်းမျဉ်းနှင့်စနစ် parameter များသတ်မှတ်', 'กำหนดกฎอัตโนมัติทั่วระบบและพารามิเตอร์', 'Atur aturan otomatis global dan parameter sistem', 'Konfigurasi peraturan automasi global dan parameter sistem', 'កំណត់ច្បាប់ស្វ័យប្រវត្តិសកល និងប៉ារ៉ាម៉ែត្រប្រព័ន្ធ'],
  'settings.loading': ['加载配置中...', '載入設定中...', 'Loading settings...', 'Đang tải cài đặt...', 'ဆက်တင်ဖွင့်နေသည်...', 'กำลังโหลดการตั้งค่า...', 'Memuat pengaturan...', 'Memuatkan tetapan...', 'កំពុងផ្ទុកការកំណត់...'],
  'settings.saved': ['系统配置已保存', '系統設定已儲存', 'System settings saved', 'Đã lưu cấu hình hệ thống', 'စနစ်ဆက်တင်သိမ်းပြီး', 'บันทึกการตั้งค่าระบบแล้ว', 'Pengaturan sistem tersimpan', 'Tetapan sistem disimpan', 'បានរក្សាទុកការកំណត់ប្រព័ន្ធ'],
  'settings.basic': ['基础设置', '基礎設定', 'Basic Settings', 'Cài đặt cơ bản', 'အခြေခံဆက်တင်', 'ตั้งค่าพื้นฐาน', 'Pengaturan Dasar', 'Tetapan Asas', 'ការកំណត់មូលដ្ឋាន'],
  'settings.registration': ['允许用户注册', '允許使用者註冊', 'Allow user registration', 'Cho phép đăng ký người dùng', 'အသုံးပြုသူမှတ်ပုံတင်ခွင့်ပြု', 'อนุญาตให้สมัครสมาชิก', 'Izinkan pendaftaran pengguna', 'Benarkan pendaftaran pengguna', 'អនុញ្ញាតឱ្យអ្នកប្រើចុះឈ្មោះ'],
  'settings.registrationDesc': ['开启后允许新用户注册账号', '開啟後允許新使用者註冊帳號', 'When enabled, new users can create accounts', 'Khi bật, người dùng mới có thể đăng ký', 'ဖွင့်ပါက အသုံးပြုသူအသစ် အကောင့်ဖန်တီးနိုင်သည်', 'เปิดแล้วผู้ใช้ใหม่สมัครบัญชีได้', 'Jika aktif, pengguna baru dapat mendaftar', 'Jika aktif, pengguna baharu boleh mendaftar', 'បើបើក អ្នកប្រើថ្មីអាចចុះឈ្មោះបាន'],
  'settings.showDefaultLogin': ['显示默认登录信息', '顯示預設登入資訊', 'Show default login info', 'Hiển thị thông tin đăng nhập mặc định', 'မူလဝင်ရန်အချက်အလက်ပြ', 'แสดงข้อมูลเข้าสู่ระบบเริ่มต้น', 'Tampilkan info login default', 'Tunjukkan maklumat log masuk lalai', 'បង្ហាញព័ត៌មានចូលលំនាំដើម'],
  'settings.showDefaultLoginDesc': ['登录页面显示默认账号密码提示', '登入頁面顯示預設帳號密碼提示', 'Show default account hints on the login page', 'Hiển thị gợi ý tài khoản mặc định trên trang đăng nhập', 'ဝင်ရန်စာမျက်နှာတွင် မူလအကောင့်အကြံပြုပြ', 'แสดงคำใบ้บัญชีรหัสผ่านเริ่มต้นที่หน้าเข้าสู่ระบบ', 'Tampilkan petunjuk akun default di halaman login', 'Tunjukkan petunjuk akaun lalai pada halaman log masuk', 'បង្ហាញណែនាំគណនីលំនាំដើមនៅទំព័រចូល'],
  'settings.loginCaptcha': ['登录滑动验证码', '登入滑動驗證碼', 'Login slider captcha', 'Captcha trượt khi đăng nhập', 'ဝင်ရန် slider captcha', 'แคปช่าสไลด์ตอนเข้าสู่ระบบ', 'Captcha slider login', 'Captcha gelangsar log masuk', 'Captcha រអិលពេលចូល'],
  'settings.loginCaptchaDesc': ['开启后账号密码登录需要完成滑动验证', '開啟後帳號密碼登入需完成滑動驗證', 'Requires slider verification for username/password login', 'Yêu cầu xác minh trượt khi đăng nhập bằng mật khẩu', 'အကောင့်/စကားဝှက်ဝင်ရန် slider အတည်ပြုလိုအပ်', 'ต้องยืนยันสไลด์เมื่อเข้าสู่ระบบด้วยบัญชีรหัสผ่าน', 'Login akun/sandi memerlukan verifikasi slider', 'Log masuk akaun/kata laluan memerlukan pengesahan gelangsar', 'ការចូលដោយគណនី/ពាក្យសម្ងាត់ត្រូវការ captcha រអិល'],
  'settings.itemSync': ['启用商品自动同步', '啟用商品自動同步', 'Enable product auto sync', 'Bật tự đồng bộ sản phẩm', 'ကုန်ပစ္စည်းအလိုအလျောက်စင့်ခ်ဖွင့်', 'เปิดซิงค์สินค้าอัตโนมัติ', 'Aktifkan sinkron produk otomatis', 'Aktifkan segerak produk automatik', 'បើកសមកាលកម្មផលិតផលស្វ័យប្រវត្តិ'],
  'settings.itemSyncDesc': ['定时自动获取商品信息到本地数据库', '定時自動取得商品資訊到本機資料庫', 'Fetch product info into the local database on schedule', 'Tự lấy thông tin sản phẩm vào CSDL cục bộ theo lịch', 'အချိန်ဇယားအတိုင်း local database သို့ကုန်ပစ္စည်းဒေတာယူ', 'ดึงข้อมูลสินค้าเข้า DB ในเครื่องตามเวลา', 'Ambil info produk ke database lokal terjadwal', 'Ambil maklumat produk ke pangkalan data tempatan mengikut jadual', 'ទាញព័ត៌មានផលិតផលទៅមូលដ្ឋានទិន្នន័យមូលដ្ឋានតាមកាលវិភាគ'],
  'settings.syncInterval': ['商品同步间隔（分钟）', '商品同步間隔（分鐘）', 'Product sync interval (minutes)', 'Khoảng đồng bộ sản phẩm (phút)', 'ကုန်ပစ္စည်းစင့်ခ်ကြားချိန် (မိနစ်)', 'ช่วงซิงค์สินค้า (นาที)', 'Interval sinkron produk (menit)', 'Selang segerak produk (minit)', 'ចន្លោះសមកាលកម្មផលិតផល (នាទី)'],
  'settings.syncIntervalHint': ['建议：10-60分钟', '建議：10-60 分鐘', 'Recommended: 10-60 minutes', 'Khuyến nghị: 10-60 phút', 'အကြံပြု: 10-60 မိနစ်', 'แนะนำ: 10-60 นาที', 'Disarankan: 10-60 menit', 'Disyorkan: 10-60 minit', 'ណែនាំ៖ 10-60 នាទី'],
  'settings.maxPages': ['每次最多同步页数', '每次最多同步頁數', 'Max pages per sync', 'Số trang tối đa mỗi lần đồng bộ', 'တစ်ကြိမ်စင့်ခ် အများဆုံးစာမျက်နှာ', 'จำนวนหน้าสูงสุดต่อการซิงค์', 'Halaman maks per sinkron', 'Halaman maks setiap segerak', 'ទំព័រអតិបរមាក្នុងមួយសមកាលកម្ម'],
  'settings.maxPagesHint': ['每页20个商品', '每頁 20 個商品', '20 products per page', '20 sản phẩm mỗi trang', 'တစ်စာမျက်နှာ 20 ကုန်ပစ္စည်း', 'หน้าละ 20 สินค้า', '20 produk per halaman', '20 produk setiap halaman', '20 ផលិតផលក្នុងមួយទំព័រ'],
  'settings.aiConfig': ['AI 智能回复配置', 'AI 智慧回覆設定', 'AI Smart Reply Config', 'Cấu hình trả lời AI', 'AI ဉာဏ်ရည်မြင့်ပြန်ကြားဆက်တင်', 'ตั้งค่าตอบกลับ AI', 'Konfigurasi Balasan AI', 'Konfigurasi Balasan AI', 'ការកំណត់ឆ្លើយតប AI'],
  'settings.apiUrl': ['API 地址', 'API 位址', 'API URL', 'Địa chỉ API', 'API URL', 'URL API', 'URL API', 'URL API', 'URL API'],
  'settings.apiUrlHint': ['无需补全 /chat/completions', '無需補全 /chat/completions', 'Do not append /chat/completions', 'Không cần thêm /chat/completions', '/chat/completions ထပ်မထည့်ပါနှင့်', 'ไม่ต้องเติม /chat/completions', 'Jangan tambahkan /chat/completions', 'Jangan tambah /chat/completions', 'កុំបន្ថែម /chat/completions'],
  'settings.model': ['模型', '模型', 'Model', 'Mô hình', 'မော်ဒယ်', 'โมเดล', 'Model', 'Model', 'ម៉ូដែល'],
  'settings.defaultReply': ['默认自动回复内容', '預設自動回覆內容', 'Default auto reply', 'Nội dung trả lời tự động mặc định', 'မူလအလိုအလျောက်ပြန်ကြားစာ', 'ข้อความตอบกลับอัตโนมัติเริ่มต้น', 'Balasan otomatis default', 'Balasan automatik lalai', 'ខ្លឹមសារឆ្លើយតបស្វ័យប្រវត្តិលំនាំដើម'],
  'settings.defaultReplyPlaceholder': ['设置默认的自动回复内容...', '設定預設自動回覆內容...', 'Set default auto reply text...', 'Đặt nội dung trả lời mặc định...', 'မူလပြန်ကြားစာသတ်မှတ်ပါ...', 'ตั้งข้อความตอบกลับเริ่มต้น...', 'Atur teks balasan default...', 'Tetapkan teks balasan lalai...', 'កំណត់អត្ថបទឆ្លើយតបលំនាំដើម...'],
  'settings.commonAiServices': ['常见 AI 服务:', '常見 AI 服務：', 'Common AI services:', 'Dịch vụ AI phổ biến:', 'အသုံးများသော AI ဝန်ဆောင်မှု:', 'บริการ AI ที่พบบ่อย:', 'Layanan AI umum:', 'Perkhidmatan AI biasa:', 'សេវា AI ទូទៅ៖'],
  'settings.smtpConfig': ['SMTP 邮件配置', 'SMTP 郵件設定', 'SMTP Email Config', 'Cấu hình email SMTP', 'SMTP Email ဆက်တင်', 'ตั้งค่าอีเมล SMTP', 'Konfigurasi Email SMTP', 'Konfigurasi E-mel SMTP', 'ការកំណត់អ៊ីមែល SMTP'],
  'settings.smtpDesc': ['配置SMTP服务器用于发送注册验证码等邮件通知', '設定 SMTP 伺服器用於發送註冊驗證碼等郵件通知', 'Configure SMTP to send verification codes and email notices', 'Cấu hình SMTP để gửi mã xác minh và email thông báo', 'အတည်ပြုကုဒ်နှင့် email သတိပေးချက်ပို့ရန် SMTP သတ်မှတ်', 'ตั้งค่า SMTP เพื่อส่งรหัสยืนยันและอีเมลแจ้งเตือน', 'Atur SMTP untuk mengirim kode verifikasi dan email notifikasi', 'Konfigurasi SMTP untuk menghantar kod pengesahan dan notis e-mel', 'កំណត់ SMTP ដើម្បីផ្ញើកូដផ្ទៀងផ្ទាត់ និងអ៊ីមែលជូនដំណឹង'],
  'settings.smtpServer': ['SMTP服务器', 'SMTP 伺服器', 'SMTP server', 'Máy chủ SMTP', 'SMTP ဆာဗာ', 'เซิร์ฟเวอร์ SMTP', 'Server SMTP', 'Pelayan SMTP', 'ម៉ាស៊ីនមេ SMTP'],
  'settings.smtpPort': ['SMTP端口', 'SMTP 連接埠', 'SMTP port', 'Cổng SMTP', 'SMTP port', 'พอร์ต SMTP', 'Port SMTP', 'Port SMTP', 'ច្រក SMTP'],
  'settings.smtpUser': ['发件邮箱', '寄件信箱', 'Sender email', 'Email gửi', 'ပို့သူ email', 'อีเมลผู้ส่ง', 'Email pengirim', 'E-mel penghantar', 'អ៊ីមែលអ្នកផ្ញើ'],
  'settings.smtpPassword': ['邮箱密码/授权码', '信箱密碼/授權碼', 'Mailbox password / app code', 'Mật khẩu email / mã ủy quyền', 'Email စကားဝှက် / app code', 'รหัสผ่านอีเมล / รหัสอนุญาต', 'Kata sandi email / kode aplikasi', 'Kata laluan e-mel / kod aplikasi', 'ពាក្យសម្ងាត់អ៊ីមែល / កូដអនុញ្ញាត'],
  'settings.smtpPasswordPlaceholder': ['输入密码或授权码', '輸入密碼或授權碼', 'Enter password or app code', 'Nhập mật khẩu hoặc mã ủy quyền', 'စကားဝှက် သို့မဟုတ် app code ထည့်', 'กรอกรหัสผ่านหรือรหัสอนุญาต', 'Masukkan sandi atau kode aplikasi', 'Masukkan kata laluan atau kod aplikasi', 'បញ្ចូលពាក្យសម្ងាត់ ឬកូដអនុញ្ញាត'],
  'settings.qqAuthHint': ['QQ邮箱需要使用授权码', 'QQ 信箱需使用授權碼', 'QQ Mail requires an app authorization code', 'QQ Mail cần mã ủy quyền', 'QQ Mail သည် app authorization code လိုအပ်သည်', 'QQ Mail ต้องใช้รหัสอนุญาต', 'QQ Mail memerlukan kode otorisasi aplikasi', 'QQ Mail memerlukan kod kebenaran aplikasi', 'QQ Mail ត្រូវការកូដអនុញ្ញាតកម្មវិធី'],
  'settings.senderName': ['发件人显示名（可选）', '寄件人顯示名稱（選填）', 'Sender display name (optional)', 'Tên hiển thị người gửi (tùy chọn)', 'ပို့သူပြသအမည် (ရွေးချယ်နိုင်)', 'ชื่อผู้ส่ง (ไม่บังคับ)', 'Nama tampilan pengirim (opsional)', 'Nama paparan penghantar (pilihan)', 'ឈ្មោះបង្ហាញអ្នកផ្ញើ (ស្រេចចិត្ត)'],
  'settings.senderNamePlaceholder': ['鱼鱼自动回复系统', '魚魚自動回覆系統', 'Yuyu Auto Reply System', 'Hệ thống trả lời tự động Yuyu', 'Yuyu အလိုအလျောက်ပြန်ကြားစနစ်', 'ระบบตอบกลับอัตโนมัติ Yuyu', 'Sistem Balasan Otomatis Yuyu', 'Sistem Balasan Automatik Yuyu', 'ប្រព័ន្ធឆ្លើយតបស្វ័យប្រវត្តិ Yuyu'],
  'settings.saveAll': ['保存所有配置', '儲存所有設定', 'Save All Settings', 'Lưu tất cả cài đặt', 'ဆက်တင်အားလုံးသိမ်း', 'บันทึกการตั้งค่าทั้งหมด', 'Simpan Semua Pengaturan', 'Simpan Semua Tetapan', 'រក្សាទុកការកំណត់ទាំងអស់'],
  'keywords.title': ['关键词管理', '關鍵字管理', 'Keyword Management', 'Quản lý từ khóa', 'သော့ချက်စာလုံးစီမံခန့်ခွဲမှု', 'จัดการคีย์เวิร์ด', 'Manajemen Kata Kunci', 'Pengurusan Kata Kunci', 'គ្រប់គ្រងពាក្យគន្លឹះ'],
  'keywords.subtitle': ['配置自动回复和关键词发货规则', '設定自動回覆與關鍵字發貨規則', 'Configure auto replies and keyword delivery rules', 'Cấu hình trả lời tự động và quy tắc giao theo từ khóa', 'အလိုအလျောက်ပြန်ကြားနှင့် keyword ပို့ဆောင်မှုစည်းမျဉ်းသတ်မှတ်', 'ตั้งค่าตอบกลับอัตโนมัติและกฎจัดส่งตามคีย์เวิร์ด', 'Atur balasan otomatis dan aturan kirim kata kunci', 'Konfigurasi balasan automatik dan peraturan penghantaran kata kunci', 'កំណត់ឆ្លើយតបស្វ័យប្រវត្តិ និងច្បាប់ដឹកជញ្ជូនតាមពាក្យគន្លឹះ'],
  'keywords.tab.reply': ['关键词回复', '關鍵字回覆', 'Keyword Reply', 'Trả lời theo từ khóa', 'Keyword ပြန်ကြား', 'ตอบกลับคีย์เวิร์ด', 'Balasan Kata Kunci', 'Balasan Kata Kunci', 'ឆ្លើយតបតាមពាក្យគន្លឹះ'],
  'keywords.tab.delivery': ['关键词发货', '關鍵字發貨', 'Keyword Delivery', 'Giao theo từ khóa', 'Keyword ပို့ဆောင်', 'จัดส่งตามคีย์เวิร์ด', 'Pengiriman Kata Kunci', 'Penghantaran Kata Kunci', 'ដឹកជញ្ជូនតាមពាក្យគន្លឹះ'],
  'keywords.tab.default': ['账号默认回复', '帳號預設回覆', 'Account Default Reply', 'Trả lời mặc định tài khoản', 'အကောင့်မူလပြန်ကြား', 'ตอบกลับเริ่มต้นของบัญชี', 'Balasan Default Akun', 'Balasan Lalai Akaun', 'ឆ្លើយតបលំនាំដើមគណនី'],
  'keywords.selectAccount': ['选择账号', '選擇帳號', 'Select account', 'Chọn tài khoản', 'အကောင့်ရွေး', 'เลือกบัญชี', 'Pilih akun', 'Pilih akaun', 'ជ្រើសគណនី'],
  'keywords.addKeyword': ['添加关键词', '新增關鍵字', 'Add keyword', 'Thêm từ khóa', 'Keyword ထည့်', 'เพิ่มคีย์เวิร์ด', 'Tambah kata kunci', 'Tambah kata kunci', 'បន្ថែមពាក្យគន្លឹះ'],
  'keywords.addDelivery': ['添加发货规则', '新增發貨規則', 'Add delivery rule', 'Thêm quy tắc giao', 'ပို့ဆောင်စည်းမျဉ်းထည့်', 'เพิ่มกฎจัดส่ง', 'Tambah aturan kirim', 'Tambah peraturan penghantaran', 'បន្ថែមច្បាប់ដឹកជញ្ជូន'],
  'keywords.editDefault': ['编辑默认回复', '編輯預設回覆', 'Edit default reply', 'Sửa trả lời mặc định', 'မူလပြန်ကြားပြင်', 'แก้ไขตอบกลับเริ่มต้น', 'Edit balasan default', 'Edit balasan lalai', 'កែសម្រួលឆ្លើយតបលំនាំដើម'],
  'keywords.needAccount': ['请选择账号', '請選擇帳號', 'Select an account', 'Chọn tài khoản', 'အကောင့်ရွေးပါ', 'เลือกบัญชี', 'Pilih akun', 'Pilih akaun', 'ជ្រើសគណនី'],
  'keywords.needAccountHint': ['选择一个账号以管理其关键词规则', '選擇一個帳號以管理其關鍵字規則', 'Select an account to manage its keyword rules', 'Chọn tài khoản để quản lý quy tắc từ khóa', 'Keyword စည်းမျဉ်းစီမံရန် အကောင့်ရွေးပါ', 'เลือกบัญชีเพื่อจัดการกฎคีย์เวิร์ด', 'Pilih akun untuk mengelola aturan kata kunci', 'Pilih akaun untuk mengurus peraturan kata kunci', 'ជ្រើសគណនីដើម្បីគ្រប់គ្រងច្បាប់ពាក្យគន្លឹះ'],
  'keywords.exactMatch': ['精确匹配', '精確匹配', 'Exact match', 'Khớp chính xác', 'တိကျကိုက်ညီ', 'ตรงเป๊ะ', 'Cocok tepat', 'Padanan tepat', 'ផ្គូផ្គងត្រឹមត្រូវ'],
  'keywords.noReplyContent': ['无回复内容', '無回覆內容', 'No reply content', 'Không có nội dung trả lời', 'ပြန်ကြားစာမရှိ', 'ไม่มีเนื้อหาตอบกลับ', 'Tidak ada isi balasan', 'Tiada kandungan balasan', 'គ្មានមាតិកាឆ្លើយតប'],
  'keywords.emptyReplyTitle': ['暂无关键词', '暫無關鍵字', 'No keywords yet', 'Chưa có từ khóa', 'Keyword မရှိသေးပါ', 'ยังไม่มีคีย์เวิร์ด', 'Belum ada kata kunci', 'Tiada kata kunci lagi', 'មិនទាន់មានពាក្យគន្លឹះ'],
  'keywords.emptyReplyHint': ['点击右上角添加新的关键词规则', '點擊右上角新增關鍵字規則', 'Use the button above to add a keyword rule', 'Nhấn nút phía trên để thêm quy tắc từ khóa', 'Keyword စည်းမျဉ်းထည့်ရန် အပေါ်ဘက်ခလုတ်နှိပ်ပါ', 'กดปุ่มด้านบนเพื่อเพิ่มกฎคีย์เวิร์ด', 'Gunakan tombol di atas untuk menambah aturan kata kunci', 'Gunakan butang di atas untuk menambah peraturan kata kunci', 'ប្រើប៊ូតុងខាងលើដើម្បីបន្ថែមច្បាប់ពាក្យគន្លឹះ'],
  'keywords.cardLabel': ['卡券：{{name}}', '卡券：{{name}}', 'Card: {{name}}', 'Thẻ: {{name}}', 'ကတ်: {{name}}', 'คีย์การ์ด: {{name}}', 'Kartu: {{name}}', 'Kad: {{name}}', 'កាត៖ {{name}}'],
  'keywords.cardFallback': ['卡券 {{id}}', '卡券 {{id}}', 'Card {{id}}', 'Thẻ {{id}}', 'ကတ် {{id}}', 'คีย์การ์ด {{id}}', 'Kartu {{id}}', 'Kad {{id}}', 'កាត {{id}}'],
  'keywords.disable': ['禁用', '停用', 'Disable', 'Tắt', 'ပိတ်', 'ปิดใช้งาน', 'Nonaktifkan', 'Lumpuhkan', 'បិទ'],
  'keywords.enable': ['启用', '啟用', 'Enable', 'Bật', 'ဖွင့်', 'เปิดใช้งาน', 'Aktifkan', 'Aktifkan', 'បើក'],
  'keywords.emptyDeliveryTitle': ['暂无发货规则', '暫無發貨規則', 'No delivery rules yet', 'Chưa có quy tắc giao', 'ပို့ဆောင်စည်းမျဉ်းမရှိသေး', 'ยังไม่มีกฎจัดส่ง', 'Belum ada aturan kirim', 'Tiada peraturan penghantaran lagi', 'មិនទាន់មានច្បាប់ដឹកជញ្ជូន'],
  'keywords.emptyDeliveryHint': ['点击右上角添加新的发货规则', '點擊右上角新增發貨規則', 'Use the button above to add a delivery rule', 'Nhấn nút phía trên để thêm quy tắc giao', 'ပို့ဆောင်စည်းမျဉ်းထည့်ရန် အပေါ်ဘက်ခလုတ်နှိပ်ပါ', 'กดปุ่มด้านบนเพื่อเพิ่มกฎจัดส่ง', 'Gunakan tombol di atas untuk menambah aturan kirim', 'Gunakan butang di atas untuk menambah peraturan penghantaran', 'ប្រើប៊ូតុងខាងលើដើម្បីបន្ថែមច្បាប់ដឹកជញ្ជូន'],
  'keywords.replyOnce': ['只回复一次', '只回覆一次', 'Reply once', 'Chỉ trả lời một lần', 'တစ်ကြိမ်သာပြန်ကြား', 'ตอบกลับครั้งเดียว', 'Balas sekali', 'Balas sekali', 'ឆ្លើយតបម្តងប៉ុណ្ណោះ'],
  'keywords.emptyAccountsHint': ['请先添加账号', '請先新增帳號', 'Add an account first', 'Vui lòng thêm tài khoản trước', 'အကောင့်အရင်ထည့်ပါ', 'โปรดเพิ่มบัญชีก่อน', 'Tambahkan akun dulu', 'Tambah akaun dahulu', 'សូមបន្ថែមគណនីជាមុន'],
  'keywords.editKeyword': ['编辑关键词', '編輯關鍵字', 'Edit keyword', 'Sửa từ khóa', 'Keyword ပြင်', 'แก้ไขคีย์เวิร์ด', 'Edit kata kunci', 'Edit kata kunci', 'កែសម្រួលពាក្យគន្លឹះ'],
  'keywords.triggerKeyword': ['触发关键词', '觸發關鍵字', 'Trigger keyword', 'Từ khóa kích hoạt', 'Trigger keyword', 'คีย์เวิร์ดกระตุ้น', 'Kata kunci pemicu', 'Kata kunci pencetus', 'ពាក្យគន្លឹះកេះ'],
  'keywords.replyPlaceholder': ['例如：价格、包邮、怎么样', '例如：價格、包郵、怎麼樣', 'Example: price, free shipping, condition', 'Ví dụ: giá, freeship, thế nào', 'ဥပမာ: ဈေး၊ ပို့ခအခမဲ့၊ အခြေအနေ', 'เช่น ราคา ส่งฟรี เป็นอย่างไร', 'Contoh: harga, gratis ongkir, kondisi', 'Contoh: harga, pos percuma, keadaan', 'ឧទាហរណ៍៖ តម្លៃ ដឹកឥតគិតថ្លៃ ស្ថានភាព'],
  'keywords.triggerReplyHint': ['买家消息中包含此关键词时自动回复', '買家訊息中包含此關鍵字時自動回覆', 'Auto reply when buyer messages contain this keyword', 'Tự trả lời khi tin người mua chứa từ khóa này', 'ဝယ်သူစာတွင် keyword ပါပါက အလိုအလျောက်ပြန်ကြား', 'ตอบอัตโนมัติเมื่อข้อความผู้ซื้อมีคีย์เวิร์ดนี้', 'Balas otomatis saat pesan pembeli berisi kata kunci ini', 'Balas automatik apabila mesej pembeli mengandungi kata kunci ini', 'ឆ្លើយតបស្វ័យប្រវត្តិពេលសារអ្នកទិញមានពាក្យនេះ'],
  'keywords.replyContent': ['回复内容', '回覆內容', 'Reply content', 'Nội dung trả lời', 'ပြန်ကြားစာ', 'เนื้อหาตอบกลับ', 'Isi balasan', 'Kandungan balasan', 'មាតិកាឆ្លើយតប'],
  'keywords.replyContentPlaceholder': ['输入自动回复的内容...', '輸入自動回覆的內容...', 'Enter auto reply content...', 'Nhập nội dung trả lời tự động...', 'အလိုအလျောက်ပြန်ကြားစာထည့်ပါ...', 'กรอกข้อความตอบกลับอัตโนมัติ...', 'Masukkan isi balasan otomatis...', 'Masukkan kandungan balasan automatik...', 'បញ្ចូលមាតិកាឆ្លើយតបស្វ័យប្រវត្តិ...'],
  'keywords.replyContentHint': ['支持换行，系统将自动发送此内容给买家', '支援換行，系統會自動將此內容發送給買家', 'Line breaks are supported. The system sends this to buyers automatically.', 'Hỗ trợ xuống dòng. Hệ thống sẽ tự gửi cho người mua.', 'စာကြောင်းခွဲထောက်ပံ့သည်။ စနစ်က ဝယ်သူထံ အလိုအလျောက်ပို့မည်။', 'รองรับขึ้นบรรทัดใหม่ ระบบจะส่งให้ผู้ซื้ออัตโนมัติ', 'Mendukung baris baru. Sistem mengirim ini otomatis ke pembeli.', 'Menyokong baris baharu. Sistem menghantar ini secara automatik kepada pembeli.', 'គាំទ្របន្ទាត់ថ្មី។ ប្រព័ន្ធនឹងផ្ញើទៅអ្នកទិញដោយស្វ័យប្រវត្តិ។'],
  'keywords.saveKeyword': ['保存关键词', '儲存關鍵字', 'Save keyword', 'Lưu từ khóa', 'Keyword သိမ်း', 'บันทึกคีย์เวิร์ด', 'Simpan kata kunci', 'Simpan kata kunci', 'រក្សាទុកពាក្យគន្លឹះ'],
  'keywords.editDelivery': ['编辑发货规则', '編輯發貨規則', 'Edit delivery rule', 'Sửa quy tắc giao', 'ပို့ဆောင်စည်းမျဉ်းပြင်', 'แก้ไขกฎจัดส่ง', 'Edit aturan kirim', 'Edit peraturan penghantaran', 'កែសម្រួលច្បាប់ដឹកជញ្ជូន'],
  'keywords.triggerDeliveryPlaceholder': ['例如：发货卡密、自动发货', '例如：發貨卡密、自動發貨', 'Example: deliver card, auto delivery', 'Ví dụ: giao thẻ, giao tự động', 'ဥပမာ: ကတ်ပို့၊ အလိုအလျောက်ပို့', 'เช่น ส่งคีย์การ์ด จัดส่งอัตโนมัติ', 'Contoh: kirim kartu, pengiriman otomatis', 'Contoh: hantar kad, penghantaran automatik', 'ឧទាហរណ៍៖ ផ្ញើកាត ដឹកជញ្ជូនស្វ័យប្រវត្តិ'],
  'keywords.triggerDeliveryHint': ['买家消息中包含此关键词时自动发货', '買家訊息中包含此關鍵字時自動發貨', 'Auto deliver when buyer messages contain this keyword', 'Tự giao khi tin người mua chứa từ khóa này', 'ဝယ်သူစာတွင် keyword ပါပါက အလိုအလျောက်ပို့', 'จัดส่งอัตโนมัติเมื่อข้อความผู้ซื้อมีคีย์เวิร์ดนี้', 'Kirim otomatis saat pesan pembeli berisi kata kunci ini', 'Hantar automatik apabila mesej pembeli mengandungi kata kunci ini', 'ដឹកជញ្ជូនស្វ័យប្រវត្តិពេលសារអ្នកទិញមានពាក្យនេះ'],
  'keywords.linkedCard': ['关联卡券', '關聯卡券', 'Linked card', 'Thẻ liên kết', 'ချိတ်ထားသောကတ်', 'คีย์การ์ดที่เชื่อม', 'Kartu terkait', 'Kad berkaitan', 'កាតភ្ជាប់'],
  'keywords.selectCard': ['请选择卡券', '請選擇卡券', 'Select a card', 'Chọn thẻ', 'ကတ်ရွေးပါ', 'เลือกคีย์การ์ด', 'Pilih kartu', 'Pilih kad', 'ជ្រើសកាត'],
  'keywords.cardHint': ['选择触发关键词时发送的卡券', '選擇觸發關鍵字時發送的卡券', 'Choose the card sent when this keyword triggers', 'Chọn thẻ gửi khi từ khóa kích hoạt', 'Keyword trigger ဖြစ်လျှင်ပို့မည့်ကတ်ရွေးပါ', 'เลือกคีย์การ์ดที่จะส่งเมื่อคีย์เวิร์ดทำงาน', 'Pilih kartu yang dikirim saat kata kunci aktif', 'Pilih kad yang dihantar apabila kata kunci dicetuskan', 'ជ្រើសកាតដែលផ្ញើពេលពាក្យគន្លឹះត្រូវបានកេះ'],
  'keywords.descriptionOptional': ['描述（可选）', '描述（選填）', 'Description (optional)', 'Mô tả (tùy chọn)', 'ဖော်ပြချက် (ရွေးချယ်နိုင်)', 'คำอธิบาย (ไม่บังคับ)', 'Deskripsi (opsional)', 'Huraian (pilihan)', 'ការពិពណ៌នា (ស្រេចចិត្ត)'],
  'keywords.descriptionPlaceholder': ['规则描述，方便识别', '規則描述，方便識別', 'Rule description for easier identification', 'Mô tả quy tắc để dễ nhận biết', 'ခွဲခြားလွယ်ရန် စည်းမျဉ်းဖော်ပြချက်', 'คำอธิบายกฎเพื่อให้จำง่าย', 'Deskripsi aturan agar mudah dikenali', 'Huraian peraturan untuk mudah dikenal pasti', 'ការពិពណ៌នាច្បាប់ដើម្បីងាយសម្គាល់'],
  'keywords.enableRule': ['启用此规则', '啟用此規則', 'Enable this rule', 'Bật quy tắc này', 'ဤစည်းမျဉ်းဖွင့်', 'เปิดใช้งานกฎนี้', 'Aktifkan aturan ini', 'Aktifkan peraturan ini', 'បើកច្បាប់នេះ'],
  'keywords.saveDelivery': ['保存发货规则', '儲存發貨規則', 'Save delivery rule', 'Lưu quy tắc giao', 'ပို့ဆောင်စည်းမျဉ်းသိမ်း', 'บันทึกกฎจัดส่ง', 'Simpan aturan kirim', 'Simpan peraturan penghantaran', 'រក្សាទុកច្បាប់ដឹកជញ្ជូន'],
  'keywords.defaultReplyForAccount': ['为此账号设置默认回复内容', '為此帳號設定預設回覆內容', 'Set default reply content for this account', 'Đặt nội dung trả lời mặc định cho tài khoản này', 'ဤအကောင့်အတွက် မူလပြန်ကြားစာသတ်မှတ်', 'ตั้งข้อความตอบกลับเริ่มต้นให้บัญชีนี้', 'Atur balasan default untuk akun ini', 'Tetapkan balasan lalai untuk akaun ini', 'កំណត់មាតិកាឆ្លើយតបលំនាំដើមសម្រាប់គណនីនេះ'],
  'keywords.enableDefaultReply': ['启用默认回复', '啟用預設回覆', 'Enable default reply', 'Bật trả lời mặc định', 'မူလပြန်ကြားဖွင့်', 'เปิดตอบกลับเริ่มต้น', 'Aktifkan balasan default', 'Aktifkan balasan lalai', 'បើកឆ្លើយតបលំនាំដើម'],
  'keywords.defaultReplyHint': ['当没有匹配的关键词时，系统将自动发送此内容', '當沒有符合的關鍵字時，系統會自動發送此內容', 'When no keyword matches, the system sends this automatically', 'Khi không khớp từ khóa, hệ thống sẽ tự gửi nội dung này', 'Keyword မကိုက်ပါက စနစ်သည် ဤစာကိုအလိုအလျောက်ပို့မည်', 'เมื่อไม่มีคีย์เวิร์ดตรง ระบบจะส่งข้อความนี้อัตโนมัติ', 'Saat tidak ada kata kunci cocok, sistem mengirim ini otomatis', 'Apabila tiada kata kunci sepadan, sistem menghantar ini automatik', 'ពេលមិនមានពាក្យគន្លឹះត្រូវគ្នា ប្រព័ន្ធនឹងផ្ញើមាតិកានេះដោយស្វ័យប្រវត្តិ'],
  'keywords.replyOnceHint': ['启用后，每个对话只使用一次默认回复', '啟用後，每個對話只使用一次預設回覆', 'When enabled, each chat receives the default reply only once', 'Khi bật, mỗi hội thoại chỉ dùng trả lời mặc định một lần', 'ဖွင့်ပါက chat တစ်ခုလျှင် မူလပြန်ကြားစာ တစ်ကြိမ်သာသုံးမည်', 'เปิดแล้วแต่ละแชทใช้ตอบกลับเริ่มต้นเพียงครั้งเดียว', 'Jika aktif, tiap chat hanya menerima balasan default sekali', 'Jika aktif, setiap perbualan menerima balasan lalai sekali sahaja', 'បើបើក ការសន្ទនានីមួយៗទទួលឆ្លើយតបលំនាំដើមតែម្តង'],
  'keywords.replyImageUrl': ['回复图片URL（可选）', '回覆圖片 URL（選填）', 'Reply image URL (optional)', 'URL ảnh trả lời (tùy chọn)', 'ပြန်ကြားပုံ URL (ရွေးချယ်နိုင်)', 'URL รูปตอบกลับ (ไม่บังคับ)', 'URL gambar balasan (opsional)', 'URL imej balasan (pilihan)', 'URL រូបភាពឆ្លើយតប (ស្រេចចិត្ត)'],
  'keywords.replyImageHint': ['可选：添加图片URL一起发送', '選填：新增圖片 URL 一起發送', 'Optional: add an image URL to send together', 'Tùy chọn: thêm URL ảnh để gửi cùng', 'ရွေးချယ်နိုင်: ပုံ URL ထည့်ပြီး အတူပို့', 'ไม่บังคับ: เพิ่ม URL รูปส่งพร้อมกัน', 'Opsional: tambah URL gambar untuk dikirim bersama', 'Pilihan: tambah URL imej untuk dihantar bersama', 'ស្រេចចិត្ត៖ បន្ថែម URL រូបភាពដើម្បីផ្ញើជាមួយ'],
  'keywords.saveDefault': ['保存默认回复', '儲存預設回覆', 'Save default reply', 'Lưu trả lời mặc định', 'မူလပြန်ကြားသိမ်း', 'บันทึกตอบกลับเริ่มต้น', 'Simpan balasan default', 'Simpan balasan lalai', 'រក្សាទុកឆ្លើយតបលំនាំដើម'],
  'keywords.needKeywordAndReply': ['请填写关键词和回复内容', '請填寫關鍵字與回覆內容', 'Enter keyword and reply content', 'Nhập từ khóa và nội dung trả lời', 'Keyword နှင့် ပြန်ကြားစာထည့်ပါ', 'กรอกคีย์เวิร์ดและข้อความตอบกลับ', 'Masukkan kata kunci dan isi balasan', 'Masukkan kata kunci dan kandungan balasan', 'បញ្ចូលពាក្យគន្លឹះ និងមាតិកាឆ្លើយតប'],
  'keywords.needTriggerKeyword': ['请填写触发关键词', '請填寫觸發關鍵字', 'Enter a trigger keyword', 'Nhập từ khóa kích hoạt', 'Trigger keyword ထည့်ပါ', 'กรอกคีย์เวิร์ดกระตุ้น', 'Masukkan kata kunci pemicu', 'Masukkan kata kunci pencetus', 'បញ្ចូលពាក្យគន្លឹះកេះ'],
  'keywords.needCard': ['请选择卡券', '請選擇卡券', 'Select a card', 'Chọn thẻ', 'ကတ်ရွေးပါ', 'เลือกคีย์การ์ด', 'Pilih kartu', 'Pilih kad', 'ជ្រើសកាត'],
  'keywords.confirmDeleteKeyword': ['确认删除该关键词吗？', '確認刪除此關鍵字嗎？', 'Delete this keyword?', 'Xóa từ khóa này?', 'ဤ keyword ကိုဖျက်မလား?', 'ยืนยันลบคีย์เวิร์ดนี้หรือไม่?', 'Hapus kata kunci ini?', 'Padam kata kunci ini?', 'លុបពាក្យគន្លឹះនេះឬ?'],
  'keywords.confirmDeleteDelivery': ['确认删除该发货规则吗？', '確認刪除此發貨規則嗎？', 'Delete this delivery rule?', 'Xóa quy tắc giao này?', 'ဤပို့ဆောင်စည်းမျဉ်းကိုဖျက်မလား?', 'ยืนยันลบกฎจัดส่งนี้หรือไม่?', 'Hapus aturan kirim ini?', 'Padam peraturan penghantaran ini?', 'លុបច្បាប់ដឹកជញ្ជូននេះឬ?'],
  'keywords.confirmDeleteDefault': ['确认删除该默认回复吗？', '確認刪除此預設回覆嗎？', 'Delete this default reply?', 'Xóa trả lời mặc định này?', 'ဤမူလပြန်ကြားစာကိုဖျက်မလား?', 'ยืนยันลบตอบกลับเริ่มต้นนี้หรือไม่?', 'Hapus balasan default ini?', 'Padam balasan lalai ini?', 'លុបឆ្លើយតបលំនាំដើមនេះឬ?'],
  'keywords.confirmClearRecords': ['确认清空该账号的回复记录吗？清空后可以重新对所有对话使用默认回复。', '確認清空此帳號的回覆記錄嗎？清空後可重新對所有對話使用預設回覆。', 'Clear reply records for this account? After clearing, default replies can be used again for all chats.', 'Xóa lịch sử trả lời của tài khoản này? Sau khi xóa, trả lời mặc định có thể dùng lại cho mọi hội thoại.', 'ဤအကောင့်၏ပြန်ကြားမှတ်တမ်းရှင်းမလား? ရှင်းပြီးနောက် chat အားလုံးတွင် မူလပြန်ကြားပြန်သုံးနိုင်သည်။', 'ล้างประวัติตอบกลับของบัญชีนี้หรือไม่? หลังล้างจะใช้ตอบกลับเริ่มต้นกับทุกแชทได้อีกครั้ง', 'Bersihkan catatan balasan akun ini? Setelah dibersihkan, balasan default bisa dipakai lagi untuk semua chat.', 'Kosongkan rekod balasan akaun ini? Selepas dikosongkan, balasan lalai boleh digunakan semula untuk semua perbualan.', 'សម្អាតកំណត់ត្រាឆ្លើយតបគណនីនេះឬ? បន្ទាប់ពីសម្អាត អាចប្រើឆ្លើយតបលំនាំដើមវិញសម្រាប់ការសន្ទនាទាំងអស់។'],
  'keywords.clearRecords': ['清空回复记录', '清空回覆記錄', 'Clear reply records', 'Xóa lịch sử trả lời', 'ပြန်ကြားမှတ်တမ်းရှင်း', 'ล้างประวัติตอบกลับ', 'Bersihkan catatan balasan', 'Kosongkan rekod balasan', 'សម្អាតកំណត់ត្រាឆ្លើយតប'],
  'market.title': ['市场调研', '市場調研', 'Market Research', 'Nghiên cứu thị trường', 'စျေးကွက်သုတေသန', 'วิจัยตลาด', 'Riset Pasar', 'Kajian Pasaran', 'ស្រាវជ្រាវទីផ្សារ'],
  'market.subtitle': ['实时抓取鱼鱼搜索结果，分析同行报价、成色、容量与热度。', '即時抓取魚魚搜尋結果，分析同行報價、成色、容量與熱度。', 'Fetch Yuyu search results in real time and analyze price, condition, storage, and demand.', 'Lấy kết quả Yuyu thời gian thực và phân tích giá, tình trạng, dung lượng, độ hot.', 'Yuyu ရှာဖွေမှုရလဒ်ကို real-time ယူပြီး ဈေး၊ အခြေအနေ၊ သိုလှောင်မှုနှင့်စိတ်ဝင်စားမှုခွဲခြမ်းပါ။', 'ดึงผลค้นหา Yuyu แบบเรียลไทม์ วิเคราะห์ราคา สภาพ ความจุ และความนิยม', 'Ambil hasil pencarian Yuyu real-time dan analisis harga, kondisi, kapasitas, serta minat.', 'Ambil hasil carian Yuyu masa nyata dan analisis harga, keadaan, storan dan permintaan.', 'ទាញលទ្ធផលស្វែងរក Yuyu ពេលពិត ហើយវិភាគតម្លៃ ស្ថានភាព ទំហំផ្ទុក និងការចាប់អារម្មណ៍។'],
  'market.lastUpdated': ['最近更新：{{time}}', '最近更新：{{time}}', 'Last updated: {{time}}', 'Cập nhật gần nhất: {{time}}', 'နောက်ဆုံးအပ်ဒိတ်: {{time}}', 'อัปเดตล่าสุด: {{time}}', 'Terakhir diperbarui: {{time}}', 'Terakhir dikemas kini: {{time}}', 'បានធ្វើបច្ចុប្បន្នភាពចុងក្រោយ៖ {{time}}'],
  'market.notQueried': ['尚未查询', '尚未查詢', 'Not queried yet', 'Chưa truy vấn', 'မရှာရသေးပါ', 'ยังไม่ได้ค้นหา', 'Belum dicari', 'Belum ditanya', 'មិនទាន់ស្វែងរក'],
  'market.account': ['调研账号', '調研帳號', 'Research account', 'Tài khoản nghiên cứu', 'သုတေသနအကောင့်', 'บัญชีวิจัย', 'Akun riset', 'Akaun kajian', 'គណនីស្រាវជ្រាវ'],
  'market.loadingAccounts': ['加载账号中...', '載入帳號中...', 'Loading accounts...', 'Đang tải tài khoản...', 'အကောင့်ဖွင့်နေသည်...', 'กำลังโหลดบัญชี...', 'Memuat akun...', 'Memuatkan akaun...', 'កំពុងផ្ទុកគណនី...'],
  'market.keyword': ['关键词', '關鍵字', 'Keyword', 'Từ khóa', 'Keyword', 'คีย์เวิร์ด', 'Kata kunci', 'Kata kunci', 'ពាក្យគន្លឹះ'],
  'market.keywordPlaceholder': ['例如：iPhone 17 Pro Max', '例如：iPhone 17 Pro Max', 'Example: iPhone 17 Pro Max', 'Ví dụ: iPhone 17 Pro Max', 'ဥပမာ: iPhone 17 Pro Max', 'เช่น iPhone 17 Pro Max', 'Contoh: iPhone 17 Pro Max', 'Contoh: iPhone 17 Pro Max', 'ឧទាហរណ៍៖ iPhone 17 Pro Max'],
  'market.maxPages': ['抓取页数', '抓取頁數', 'Pages to fetch', 'Số trang lấy', 'ယူမည့်စာမျက်နှာ', 'จำนวนหน้าที่ดึง', 'Halaman diambil', 'Halaman diambil', 'ចំនួនទំព័រទាញ'],
  'market.includeTerms': ['必须包含', '必須包含', 'Must include', 'Phải chứa', 'ပါဝင်ရမည်', 'ต้องมี', 'Harus memuat', 'Mesti mengandungi', 'ត្រូវមាន'],
  'market.includePlaceholder': ['逗号分隔，如：国行,256GB', '逗號分隔，如：國行,256GB', 'Comma-separated, e.g. CN version,256GB', 'Phân tách bằng dấu phẩy, VD: bản nội địa,256GB', 'ကော်မာဖြင့်ခွဲ၊ ဥပမာ: CN version,256GB', 'คั่นด้วยจุลภาค เช่น เครื่องจีน,256GB', 'Pisah koma, mis. versi CN,256GB', 'Pisah koma, cth: versi CN,256GB', 'បំបែកដោយក្បៀស ឧ. CN version,256GB'],
  'market.excludeTerms': ['排除词', '排除詞', 'Exclude terms', 'Từ loại trừ', 'ဖယ်ရှားမည့်စကားလုံး', 'คำตัดออก', 'Kata pengecualian', 'Terma dikecualikan', 'ពាក្យដកចេញ'],
  'market.excludePlaceholder': ['逗号分隔，如：手机壳,贴膜', '逗號分隔，如：手機殼,貼膜', 'Comma-separated, e.g. case,screen protector', 'Phân tách bằng dấu phẩy, VD: ốp,lớp dán', 'ကော်မာဖြင့်ခွဲ၊ ဥပမာ: case,screen protector', 'คั่นด้วยจุลภาค เช่น เคส,ฟิล์ม', 'Pisah koma, mis. casing,pelindung layar', 'Pisah koma, cth: casing,pelindung skrin', 'បំបែកដោយក្បៀស ឧ. ស្រោម,ហ្វីលអេក្រង់'],
  'market.minPrice': ['最低价格', '最低價格', 'Min price', 'Giá thấp nhất', 'အနိမ့်ဆုံးဈေး', 'ราคาต่ำสุด', 'Harga minimum', 'Harga minimum', 'តម្លៃអប្បបរមា'],
  'market.maxPrice': ['最高价格', '最高價格', 'Max price', 'Giá cao nhất', 'အမြင့်ဆုံးဈေး', 'ราคาสูงสุด', 'Harga maksimum', 'Harga maksimum', 'តម្លៃអតិបរមា'],
  'market.priceExampleLow': ['例如：3000', '例如：3000', 'Example: 3000', 'Ví dụ: 3000', 'ဥပမာ: 3000', 'เช่น 3000', 'Contoh: 3000', 'Contoh: 3000', 'ឧទាហរណ៍៖ 3000'],
  'market.priceExampleHigh': ['例如：9000', '例如：9000', 'Example: 9000', 'Ví dụ: 9000', 'ဥပမာ: 9000', 'เช่น 9000', 'Contoh: 9000', 'Contoh: 9000', 'ឧទាហរណ៍៖ 9000'],
  'market.sort': ['排序方式', '排序方式', 'Sort by', 'Sắp xếp', 'အစဉ်လိုက်', 'เรียงตาม', 'Urutkan', 'Susun ikut', 'តម្រៀបតាម'],
  'market.sort.priceAsc': ['价格升序', '價格升冪', 'Price ascending', 'Giá tăng dần', 'ဈေးနှုန်းနိမ့်မှမြင့်', 'ราคาน้อยไปมาก', 'Harga naik', 'Harga menaik', 'តម្លៃឡើង'],
  'market.sort.priceDesc': ['价格降序', '價格降冪', 'Price descending', 'Giá giảm dần', 'ဈေးနှုန်းမြင့်မှနိမ့်', 'ราคามากไปน้อย', 'Harga turun', 'Harga menurun', 'តម្លៃចុះ'],
  'market.sort.wantDesc': ['想要人数', '想要人數', 'Wanted count', 'Số người muốn', 'လိုချင်သူအရေအတွက်', 'จำนวนคนอยากได้', 'Jumlah peminat', 'Jumlah berminat', 'ចំនួនចង់បាន'],
  'market.sort.latest': ['最新发布时间', '最新發布時間', 'Latest publish time', 'Thời gian đăng mới nhất', 'နောက်ဆုံးတင်ချိန်', 'เวลาลงล่าสุด', 'Waktu terbit terbaru', 'Masa terbit terkini', 'ពេលផ្សព្វផ្សាយថ្មីបំផុត'],
  'market.sort.quality': ['优质商家优先', '優質商家優先', 'Quality sellers first', 'Ưu tiên người bán chất lượng', 'အရည်အသွေးမြင့်ရောင်းသူဦးစားပေး', 'ผู้ขายคุณภาพก่อน', 'Penjual berkualitas dulu', 'Penjual berkualiti dahulu', 'អ្នកលក់គុណភាពជាមុន'],
  'market.autoRefreshInterval': ['自动刷新间隔（秒）', '自動重新整理間隔（秒）', 'Auto refresh interval (seconds)', 'Khoảng tự làm mới (giây)', 'အလိုအလျောက် refresh ကြားချိန် (စက္ကန့်)', 'ช่วงรีเฟรชอัตโนมัติ (วินาที)', 'Interval segar otomatis (detik)', 'Selang segar semula automatik (saat)', 'ចន្លោះធ្វើឱ្យស្រស់ស្វ័យប្រវត្តិ (វិនាទី)'],
  'market.stopAutoRefresh': ['停止自动刷新', '停止自動重新整理', 'Stop auto refresh', 'Dừng tự làm mới', 'အလိုအလျောက် refresh ရပ်', 'หยุดรีเฟรชอัตโนมัติ', 'Hentikan segar otomatis', 'Henti segar semula automatik', 'បញ្ឈប់ធ្វើឱ្យស្រស់ស្វ័យប្រវត្តិ'],
  'market.startAutoRefresh': ['开启自动刷新', '開啟自動重新整理', 'Start auto refresh', 'Bật tự làm mới', 'အလိုအလျောက် refresh ဖွင့်', 'เปิดรีเฟรชอัตโนมัติ', 'Mulai segar otomatis', 'Mula segar semula automatik', 'បើកធ្វើឱ្យស្រស់ស្វ័យប្រវត្តិ'],
  'market.startResearch': ['开始调研', '開始調研', 'Start research', 'Bắt đầu nghiên cứu', 'သုတေသနစတင်', 'เริ่มวิจัย', 'Mulai riset', 'Mula kajian', 'ចាប់ផ្តើមស្រាវជ្រាវ'],
  'market.exportJson': ['导出 JSON', '匯出 JSON', 'Export JSON', 'Xuất JSON', 'JSON ထုတ်', 'ส่งออก JSON', 'Ekspor JSON', 'Eksport JSON', 'នាំចេញ JSON'],
  'market.exportCsv': ['导出 CSV', '匯出 CSV', 'Export CSV', 'Xuất CSV', 'CSV ထုတ်', 'ส่งออก CSV', 'Ekspor CSV', 'Eksport CSV', 'នាំចេញ CSV'],
  'market.clearCache': ['清空缓存', '清空快取', 'Clear cache', 'Xóa bộ nhớ đệm', 'cache ရှင်း', 'ล้างแคช', 'Bersihkan cache', 'Kosongkan cache', 'សម្អាត cache'],
  'market.captchaTriggered': ['搜索触发验证码，请先完成人工验证。', '搜尋觸發驗證碼，請先完成人工驗證。', 'Search triggered a captcha. Complete manual verification first.', 'Tìm kiếm kích hoạt captcha, vui lòng xác minh thủ công trước.', 'ရှာဖွေမှုကြောင့် captcha ပေါ်သည်။ လူကိုယ်တိုင်အတည်ပြုပါ။', 'การค้นหาทริกเกอร์แคปช่า โปรดยืนยันด้วยตนเองก่อน', 'Pencarian memicu captcha. Selesaikan verifikasi manual dulu.', 'Carian mencetuskan captcha. Lengkapkan pengesahan manual dahulu.', 'ការស្វែងរកបានបង្ក CAPTCHA។ សូមផ្ទៀងផ្ទាត់ដោយដៃជាមុន។'],
  'market.browserHandoff': ['已切换到本机浏览器接管，请直接在浏览器窗口完成验证。', '已切換到本機瀏覽器接管，請直接在瀏覽器視窗完成驗證。', 'Local browser handoff is active. Complete verification in the browser window.', 'Đã chuyển sang trình duyệt cục bộ, hãy xác minh trong cửa sổ trình duyệt.', 'Local browser သို့လွှဲပြီးပါပြီ။ browser window တွင်အတည်ပြုပါ။', 'ส่งต่อไปยังเบราว์เซอร์เครื่องนี้แล้ว โปรดยืนยันในหน้าต่างเบราว์เซอร์', 'Dialihkan ke browser lokal. Selesaikan verifikasi di jendela browser.', 'Dialihkan kepada pelayar tempatan. Lengkapkan pengesahan dalam tetingkap pelayar.', 'បានផ្ទេរទៅកម្មវិធីរុករកមូលដ្ឋាន។ សូមផ្ទៀងផ្ទាត់ក្នុងបង្អួច browser។'],
  'market.captchaStatus': ['当前状态：{{status}}', '目前狀態：{{status}}', 'Current status: {{status}}', 'Trạng thái hiện tại: {{status}}', 'လက်ရှိအခြေအနေ: {{status}}', 'สถานะปัจจุบัน: {{status}}', 'Status saat ini: {{status}}', 'Status semasa: {{status}}', 'ស្ថានភាពបច្ចុប្បន្ន៖ {{status}}'],
  'market.captchaResuming': ['验证已完成，正在自动继续抓取', '驗證已完成，正在自動繼續抓取', 'Verification complete, resuming automatically', 'Đã xác minh, đang tự tiếp tục lấy dữ liệu', 'အတည်ပြုပြီး၊ အလိုအလျောက်ဆက်ယူနေသည်', 'ยืนยันแล้ว กำลังดึงต่ออัตโนมัติ', 'Verifikasi selesai, melanjutkan otomatis', 'Pengesahan selesai, menyambung automatik', 'ផ្ទៀងផ្ទាត់រួច កំពុងបន្តទាញដោយស្វ័យប្រវត្តិ'],
  'market.captchaWillResume': ['验证已完成，即将自动继续抓取', '驗證已完成，即將自動繼續抓取', 'Verification complete, resuming shortly', 'Đã xác minh, sắp tự tiếp tục lấy dữ liệu', 'အတည်ပြုပြီး၊ မကြာမီဆက်ယူမည်', 'ยืนยันแล้ว จะดึงต่ออัตโนมัติเร็วๆ นี้', 'Verifikasi selesai, segera melanjutkan', 'Pengesahan selesai, akan menyambung sebentar lagi', 'ផ្ទៀងផ្ទាត់រួច នឹងបន្តទាញឆាប់ៗ'],
  'market.captchaWaiting': ['等待你在本机浏览器完成验证', '等待您在本機瀏覽器完成驗證', 'Waiting for verification in the local browser', 'Đang chờ bạn xác minh trong trình duyệt cục bộ', 'Local browser တွင်အတည်ပြုရန်စောင့်နေသည်', 'รอคุณยืนยันในเบราว์เซอร์เครื่องนี้', 'Menunggu verifikasi di browser lokal', 'Menunggu pengesahan dalam pelayar tempatan', 'កំពុងរង់ចាំការផ្ទៀងផ្ទាត់ក្នុង browser មូលដ្ឋាន'],
  'market.syncedCount': ['已同步结果：{{count}} 条', '已同步結果：{{count}} 筆', 'Synced results: {{count}}', 'Kết quả đã đồng bộ: {{count}}', 'စင့်ခ်ရလဒ်: {{count}} ခု', 'ผลลัพธ์ที่ซิงค์แล้ว: {{count}}', 'Hasil tersinkron: {{count}}', 'Hasil disegerak: {{count}}', 'លទ្ធផលបានសមកាលកម្ម៖ {{count}}'],
  'market.resumeNow': ['立即继续抓取', '立即繼續抓取', 'Resume now', 'Tiếp tục ngay', 'ယခုဆက်ယူ', 'ดึงต่อทันที', 'Lanjutkan sekarang', 'Sambung sekarang', 'បន្តឥឡូវ'],
  'market.resuming': ['恢复抓取中...', '恢復抓取中...', 'Resuming...', 'Đang tiếp tục...', 'ပြန်လည်ယူနေသည်...', 'กำลังดึงต่อ...', 'Melanjutkan...', 'Menyambung...', 'កំពុងបន្ត...'],
  'market.openCaptchaControl': ['打开验证码控制页面', '開啟驗證碼控制頁面', 'Open captcha control page', 'Mở trang điều khiển captcha', 'captcha control စာမျက်နှာဖွင့်', 'เปิดหน้าควบคุมแคปช่า', 'Buka halaman kontrol captcha', 'Buka halaman kawalan captcha', 'បើកទំព័រគ្រប់គ្រង captcha'],
  'market.summary.filtered': ['筛后商品数', '篩後商品數', 'Filtered products', 'Sản phẩm sau lọc', 'စစ်ပြီးကုန်ပစ္စည်း', 'สินค้าหลังกรอง', 'Produk tersaring', 'Produk ditapis', 'ផលិតផលក្រោយតម្រង'],
  'market.summary.median': ['中位价', '中位價', 'Median price', 'Giá trung vị', 'အလယ်တန်းဈေး', 'ราคามัธยฐาน', 'Harga median', 'Harga median', 'តម្លៃមធ្យម'],
  'market.summary.avg': ['均价', '均價', 'Average price', 'Giá trung bình', 'ပျမ်းမျှဈေး', 'ราคาเฉลี่ย', 'Harga rata-rata', 'Harga purata', 'តម្លៃមធ្យមភាគ'],
  'market.summary.range': ['价格区间', '價格區間', 'Price range', 'Khoảng giá', 'ဈေးနှုန်းအကွာအဝေး', 'ช่วงราคา', 'Rentang harga', 'Julat harga', 'ជួរតម្លៃ'],
  'market.summary.quality': ['优质商家', '優質商家', 'Quality sellers', 'Người bán chất lượng', 'အရည်အသွေးရောင်းသူ', 'ผู้ขายคุณภาพ', 'Penjual berkualitas', 'Penjual berkualiti', 'អ្នកលក់គុណភាព'],
  'market.summary.contactable': ['可沟通商家', '可溝通商家', 'Contactable sellers', 'Người bán có thể liên hệ', 'ဆက်သွယ်နိုင်သောရောင်းသူ', 'ผู้ขายที่ติดต่อได้', 'Penjual dapat dihubungi', 'Penjual boleh dihubungi', 'អ្នកលក់អាចទាក់ទងបាន'],
  'market.conditionDistribution': ['成色分布', '成色分布', 'Condition Distribution', 'Phân bố tình trạng', 'အခြေအနေဖြန့်ဖြူးမှု', 'การกระจายสภาพ', 'Distribusi Kondisi', 'Taburan Keadaan', 'ការចែកចាយស្ថានភាព'],
  'market.storagePriceBand': ['容量价格带', '容量價格帶', 'Storage Price Bands', 'Dải giá theo dung lượng', 'သိုလှောင်မှုပမာဏဈေးကွက်', 'ช่วงราคาตามความจุ', 'Rentang Harga Kapasitas', 'Jalur Harga Storan', 'ជួរតម្លៃតាមទំហំផ្ទុក'],
  'market.samplesCount': ['{{count}} 条样本', '{{count}} 筆樣本', '{{count}} samples', '{{count}} mẫu', 'နမူနာ {{count}} ခု', '{{count}} ตัวอย่าง', '{{count}} sampel', '{{count}} sampel', '{{count}} គំរូ'],
  'market.avgPrice': ['均价 {{price}}', '均價 {{price}}', 'Avg {{price}}', 'TB {{price}}', 'ပျမ်းမျှ {{price}}', 'เฉลี่ย {{price}}', 'Rata-rata {{price}}', 'Purata {{price}}', 'មធ្យម {{price}}'],
  'market.qualityTitle': ['优质商家筛选与自动沟通', '優質商家篩選與自動溝通', 'Quality Seller Filtering & Auto Contact', 'Lọc người bán chất lượng & tự liên hệ', 'အရည်အသွေးရောင်းသူစစ်ခြင်းနှင့် အလိုအလျောက်ဆက်သွယ်', 'คัดกรองผู้ขายคุณภาพและติดต่ออัตโนมัติ', 'Filter Penjual Berkualitas & Kontak Otomatis', 'Tapis Penjual Berkualiti & Hubungi Automatik', 'តម្រងអ្នកលក់គុណភាព និងទាក់ទងស្វ័យប្រវត្តិ'],
  'market.qualitySubtitle': ['按成色、价格、瑕疵、资料完整度评分，只会联系你确认后的前几位卖家。', '依成色、價格、瑕疵、資料完整度評分，只會聯絡您確認後的前幾位賣家。', 'Scores by condition, price, defects, and profile completeness; contacts only the top sellers you confirm.', 'Chấm điểm theo tình trạng, giá, lỗi, độ đủ thông tin; chỉ liên hệ vài người bán đầu bạn xác nhận.', 'အခြေအနေ၊ ဈေး၊ အပြစ်အနာ၊ အချက်အလက်ပြည့်စုံမှုဖြင့်အမှတ်ပေးပြီး သင်အတည်ပြုသောထိပ်ဆုံးရောင်းသူများကိုသာဆက်သွယ်မည်။', 'ให้คะแนนจากสภาพ ราคา ตำหนิ และข้อมูลครบถ้วน ติดต่อเฉพาะผู้ขายอันดับต้นที่คุณยืนยัน', 'Skor berdasarkan kondisi, harga, cacat, dan kelengkapan info; hanya menghubungi penjual teratas yang Anda konfirmasi.', 'Skor mengikut keadaan, harga, kecacatan dan kelengkapan maklumat; hanya menghubungi penjual teratas yang anda sahkan.', 'ដាក់ពិន្ទុតាមស្ថានភាព តម្លៃ ខូចខាត និងភាពពេញលេញព័ត៌មាន; ទាក់ទងតែអ្នកលក់កំពូលដែលអ្នកបញ្ជាក់។'],
  'market.qualityHit': ['当前命中 {{quality}} 位，能自动沟通 {{contactable}} 位', '目前命中 {{quality}} 位，可自動溝通 {{contactable}} 位', '{{quality}} matched, {{contactable}} contactable', 'Khớp {{quality}}, có thể liên hệ {{contactable}}', 'ကိုက်ညီ {{quality}}၊ ဆက်သွယ်နိုင် {{contactable}}', 'พบ {{quality}} ราย ติดต่ออัตโนมัติได้ {{contactable}} ราย', 'Cocok {{quality}}, dapat dihubungi {{contactable}}', 'Padan {{quality}}, boleh dihubungi {{contactable}}', 'ត្រូវគ្នា {{quality}}, អាចទាក់ទង {{contactable}}'],
  'market.minScore': ['最低评分', '最低評分', 'Minimum score', 'Điểm tối thiểu', 'အနိမ့်ဆုံးအမှတ်', 'คะแนนขั้นต่ำ', 'Skor minimum', 'Skor minimum', 'ពិន្ទុអប្បបរមា'],
  'market.maxContact': ['最多联系', '最多聯絡', 'Max contacts', 'Liên hệ tối đa', 'အများဆုံးဆက်သွယ်', 'ติดต่อสูงสุด', 'Kontak maks', 'Hubungi maks', 'ទាក់ទងអតិបរមា'],
  'market.contactDelay': ['联系间隔（秒）', '聯絡間隔（秒）', 'Contact interval (seconds)', 'Khoảng liên hệ (giây)', 'ဆက်သွယ်ကြားချိန် (စက္ကန့်)', 'ช่วงติดต่อ (วินาที)', 'Interval kontak (detik)', 'Selang hubungi (saat)', 'ចន្លោះទាក់ទង (វិនាទី)'],
  'market.messageTemplate': ['沟通模板', '溝通範本', 'Message template', 'Mẫu tin nhắn', 'စာပို့ template', 'เทมเพลตข้อความ', 'Template pesan', 'Templat mesej', 'គំរូសារ'],
  'market.messagePlaceholder': ['留空时按类目自动生成简短话术；支持变量：${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', '留空時依類目自動生成簡短話術；支援變數：${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'Leave blank to auto-generate a short message by category; variables: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'Để trống để tự tạo câu ngắn theo danh mục; biến: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'အလွတ်ထားပါက အမျိုးအစားအလိုက် စာတို auto-generate; variables: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'เว้นว่างเพื่อสร้างข้อความสั้นตามหมวดหมู่อัตโนมัติ; ตัวแปร: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'Kosongkan untuk membuat pesan singkat otomatis per kategori; variabel: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'Biarkan kosong untuk jana mesej ringkas mengikut kategori; pemboleh ubah: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}', 'ទុកទទេដើម្បីបង្កើតសារខ្លីតាមប្រភេទដោយស្វ័យប្រវត្តិ; variables: ${seller_name} ${item_title} ${item_title_raw} ${price} ${condition} ${storage} ${battery_health}'],
  'market.messageHint': ['留空会自动按类目生成更自然的短句：数码优先问成色/功能/电池，家电家具优先问成色/功能/使用情况。', '留空會依類目自動生成更自然的短句：數位優先問成色/功能/電池，家電家具優先問成色/功能/使用情況。', 'Blank uses natural category-based messages: electronics ask condition/function/battery; appliances and furniture ask condition/function/usage.', 'Để trống sẽ tự tạo câu tự nhiên theo danh mục: điện tử hỏi tình trạng/chức năng/pin; gia dụng/nội thất hỏi tình trạng/chức năng/sử dụng.', 'အလွတ်ထားပါက အမျိုးအစားအလိုက် သဘာဝစာတိုဖန်တီးသည်: digital အတွက် အခြေအနေ/လုပ်ဆောင်ချက်/battery, အိမ်သုံးအတွက် အခြေအနေ/လုပ်ဆောင်ချက်/အသုံးပြုမှုမေး။', 'เว้นว่างจะสร้างข้อความธรรมชาติตามหมวด: ดิจิทัลถามสภาพ/ฟังก์ชัน/แบตเตอรี่ เครื่องใช้/เฟอร์นิเจอร์ถามสภาพ/ฟังก์ชัน/การใช้งาน', 'Kosong akan membuat pesan alami per kategori: elektronik tanya kondisi/fungsi/baterai; peralatan/furnitur tanya kondisi/fungsi/pemakaian.', 'Kosong akan menjana mesej semula jadi mengikut kategori: elektronik tanya keadaan/fungsi/bateri; perabot/peralatan tanya keadaan/fungsi/penggunaan.', 'ទុកទទេនឹងបង្កើតសារធម្មជាតិតាមប្រភេទ៖ អេឡិចត្រូនិកសួរស្ថានភាព/មុខងារ/ថ្ម; គ្រឿងផ្ទះ/គ្រឿងសង្ហារិមសួរស្ថានភាព/មុខងារ/ការប្រើ។'],
  'market.contactTop': ['自动沟通前 {{count}} 位', '自動溝通前 {{count}} 位', 'Auto contact top {{count}}', 'Tự liên hệ {{count}} người đầu', 'ထိပ်ဆုံး {{count}} ဦးကို အလိုအလျောက်ဆက်သွယ်', 'ติดต่ออัตโนมัติ {{count}} อันดับแรก', 'Kontak otomatis {{count}} teratas', 'Hubungi automatik {{count}} teratas', 'ទាក់ទងស្វ័យប្រវត្តិ {{count}} កំពូល'],
  'market.contactGuard': ['仅联系有卖家ID且商品ID真实的结果，避免误发。', '僅聯絡有賣家 ID 且商品 ID 真實的結果，避免誤發。', 'Only contacts results with seller ID and real product ID to avoid mistakes.', 'Chỉ liên hệ kết quả có ID người bán và ID sản phẩm thật để tránh gửi nhầm.', 'ရောင်းသူ ID နှင့်မှန်ကန်သောကုန်ပစ္စည်း ID ရှိသောရလဒ်များကိုသာဆက်သွယ်သည်။', 'ติดต่อเฉพาะผลลัพธ์ที่มี ID ผู้ขายและ ID สินค้าจริงเพื่อป้องกันส่งผิด', 'Hanya menghubungi hasil dengan ID penjual dan ID produk valid agar tidak salah kirim.', 'Hanya menghubungi hasil dengan ID penjual dan ID produk sebenar untuk elak salah hantar.', 'ទាក់ទងតែលទ្ធផលដែលមាន ID អ្នកលក់ និង ID ផលិតផលពិត ដើម្បីជៀសវាងផ្ញើខុស។'],
  'market.sendProgress': ['发送进度：{{processed}} / {{total}}', '發送進度：{{processed}} / {{total}}', 'Send progress: {{processed}} / {{total}}', 'Tiến độ gửi: {{processed}} / {{total}}', 'ပို့မှုတိုးတက်မှု: {{processed}} / {{total}}', 'ความคืบหน้าส่ง: {{processed}} / {{total}}', 'Progres kirim: {{processed}} / {{total}}', 'Kemajuan hantar: {{processed}} / {{total}}', 'វឌ្ឍនភាពផ្ញើ៖ {{processed}} / {{total}}'],
  'market.contactQueued': ['任务已创建，准备开始发送', '任務已建立，準備開始發送', 'Task created, preparing to send', 'Đã tạo tác vụ, chuẩn bị gửi', 'အလုပ်ဖန်တီးပြီး၊ ပို့ရန်ပြင်နေ', 'สร้างงานแล้ว เตรียมส่ง', 'Tugas dibuat, bersiap mengirim', 'Tugas dibuat, bersedia menghantar', 'បានបង្កើតកិច្ចការ កំពុងរៀបចំផ្ញើ'],
  'market.contactRunning': ['正在联系：{{seller}} · {{title}}', '正在聯絡：{{seller}} · {{title}}', 'Contacting: {{seller}} · {{title}}', 'Đang liên hệ: {{seller}} · {{title}}', 'ဆက်သွယ်နေ: {{seller}} · {{title}}', 'กำลังติดต่อ: {{seller}} · {{title}}', 'Menghubungi: {{seller}} · {{title}}', 'Menghubungi: {{seller}} · {{title}}', 'កំពុងទាក់ទង៖ {{seller}} · {{title}}'],
  'market.contactCompleted': ['已完成，成功 {{success}} / 失败 {{failed}}', '已完成，成功 {{success}} / 失敗 {{failed}}', 'Completed, {{success}} success / {{failed}} failed', 'Hoàn tất, thành công {{success}} / thất bại {{failed}}', 'ပြီးဆုံး၊ အောင်မြင် {{success}} / မအောင်မြင် {{failed}}', 'เสร็จแล้ว สำเร็จ {{success}} / ล้มเหลว {{failed}}', 'Selesai, {{success}} berhasil / {{failed}} gagal', 'Selesai, {{success}} berjaya / {{failed}} gagal', 'រួចរាល់ ជោគជ័យ {{success}} / បរាជ័យ {{failed}}'],
  'market.contactFailed': ['任务执行失败', '任務執行失敗', 'Task failed', 'Tác vụ thất bại', 'အလုပ်မအောင်မြင်', 'งานล้มเหลว', 'Tugas gagal', 'Tugas gagal', 'កិច្ចការបរាជ័យ'],
  'market.jobId': ['任务ID：{{id}}', '任務 ID：{{id}}', 'Job ID: {{id}}', 'ID tác vụ: {{id}}', 'အလုပ် ID: {{id}}', 'ID งาน: {{id}}', 'ID tugas: {{id}}', 'ID tugas: {{id}}', 'លេខសម្គាល់កិច្ចការ៖ {{id}}'],
  'market.table.seller': ['卖家', '賣家', 'Seller', 'Người bán', 'ရောင်းသူ', 'ผู้ขาย', 'Penjual', 'Penjual', 'អ្នកលក់'],
  'market.table.product': ['商品', '商品', 'Product', 'Sản phẩm', 'ကုန်ပစ္စည်း', 'สินค้า', 'Produk', 'Produk', 'ផលិតផល'],
  'market.table.score': ['评分', '評分', 'Score', 'Điểm', 'အမှတ်', 'คะแนน', 'Skor', 'Skor', 'ពិន្ទុ'],
  'market.table.reason': ['理由', '理由', 'Reason', 'Lý do', 'အကြောင်းရင်း', 'เหตุผล', 'Alasan', 'Sebab', 'ហេតុផល'],
  'market.table.title': ['标题', '標題', 'Title', 'Tiêu đề', 'ခေါင်းစဉ်', 'ชื่อ', 'Judul', 'Tajuk', 'ចំណងជើង'],
  'market.table.price': ['价格', '價格', 'Price', 'Giá', 'ဈေးနှုန်း', 'ราคา', 'Harga', 'Harga', 'តម្លៃ'],
  'market.table.condition': ['成色', '成色', 'Condition', 'Tình trạng', 'အခြေအနေ', 'สภาพ', 'Kondisi', 'Keadaan', 'ស្ថានភាព'],
  'market.table.storage': ['容量', '容量', 'Storage', 'Dung lượng', 'သိုလှောင်မှု', 'ความจุ', 'Kapasitas', 'Storan', 'ទំហំផ្ទុក'],
  'market.table.battery': ['电池', '電池', 'Battery', 'Pin', 'Battery', 'แบตเตอรี่', 'Baterai', 'Bateri', 'ថ្ម'],
  'market.table.want': ['想要', '想要', 'Wanted', 'Muốn', 'လိုချင်', 'อยากได้', 'Diminati', 'Berminat', 'ចង់បាន'],
  'market.table.area': ['地区', '地區', 'Area', 'Khu vực', 'နေရာ', 'พื้นที่', 'Area', 'Kawasan', 'តំបន់'],
  'market.table.time': ['时间', '時間', 'Time', 'Thời gian', 'အချိန်', 'เวลา', 'Waktu', 'Masa', 'ពេលវេលា'],
  'market.autoContactReady': ['可自动沟通', '可自動溝通', 'Ready for auto contact', 'Có thể tự liên hệ', 'အလိုအလျောက်ဆက်သွယ်နိုင်', 'ติดต่ออัตโนมัติได้', 'Siap kontak otomatis', 'Sedia dihubungi automatik', 'អាចទាក់ទងស្វ័យប្រវត្តិ'],
  'market.notContactable': ['暂不可联系', '暫不可聯絡', 'Not contactable yet', 'Chưa thể liên hệ', 'မဆက်သွယ်နိုင်သေး', 'ยังติดต่อไม่ได้', 'Belum dapat dihubungi', 'Belum boleh dihubungi', 'មិនទាន់អាចទាក់ទងបាន'],
  'market.noQualityItems': ['先完成调研，或把最低评分调低一些。', '請先完成調研，或將最低評分調低一些。', 'Run research first, or lower the minimum score.', 'Hãy nghiên cứu trước hoặc giảm điểm tối thiểu.', 'သုတေသနအရင်လုပ်ပါ သို့မဟုတ် အနိမ့်ဆုံးအမှတ်လျှော့ပါ။', 'ทำวิจัยก่อน หรือปรับคะแนนขั้นต่ำลง', 'Jalankan riset dulu, atau turunkan skor minimum.', 'Jalankan kajian dahulu, atau turunkan skor minimum.', 'ដំណើរការស្រាវជ្រាវជាមុន ឬបន្ថយពិន្ទុអប្បបរមា។'],
  'market.contactResult': ['沟通结果：成功 {{success}} / 失败 {{failed}}', '溝通結果：成功 {{success}} / 失敗 {{failed}}', 'Contact result: {{success}} success / {{failed}} failed', 'Kết quả liên hệ: thành công {{success}} / thất bại {{failed}}', 'ဆက်သွယ်မှုရလဒ်: အောင်မြင် {{success}} / မအောင်မြင် {{failed}}', 'ผลติดต่อ: สำเร็จ {{success}} / ล้มเหลว {{failed}}', 'Hasil kontak: {{success}} berhasil / {{failed}} gagal', 'Keputusan hubungi: {{success}} berjaya / {{failed}} gagal', 'លទ្ធផលទាក់ទង៖ ជោគជ័យ {{success}} / បរាជ័យ {{failed}}'],
  'market.chatId': ['会话 {{id}}', '會話 {{id}}', 'Chat {{id}}', 'Hội thoại {{id}}', 'Chat {{id}}', 'แชท {{id}}', 'Chat {{id}}', 'Perbualan {{id}}', 'ការសន្ទនា {{id}}'],
  'market.sendStatus.queued': ['排队中', '排隊中', 'Queued', 'Đang xếp hàng', 'တန်းစီနေ', 'รอคิว', 'Antre', 'Dalam baris gilir', 'កំពុងតម្រង់ជួរ'],
  'market.sendStatus.sending': ['发送中', '發送中', 'Sending', 'Đang gửi', 'ပို့နေသည်', 'กำลังส่ง', 'Mengirim', 'Menghantar', 'កំពុងផ្ញើ'],
  'market.sendStatus.sent': ['已发送', '已發送', 'Sent', 'Đã gửi', 'ပို့ပြီး', 'ส่งแล้ว', 'Terkirim', 'Dihantar', 'បានផ្ញើ'],
  'market.sendStatus.failed': ['失败', '失敗', 'Failed', 'Thất bại', 'မအောင်မြင်', 'ล้มเหลว', 'Gagal', 'Gagal', 'បរាជ័យ'],
  'market.resultsTitle': ['结果列表', '結果清單', 'Results', 'Danh sách kết quả', 'ရလဒ်စာရင်း', 'รายการผลลัพธ์', 'Daftar Hasil', 'Senarai Keputusan', 'បញ្ជីលទ្ធផល'],
  'market.resultStats': ['原始 {{raw}} 条 / 去重 {{deduped}} 条 / 筛选后 {{filtered}} 条', '原始 {{raw}} 筆 / 去重 {{deduped}} 筆 / 篩選後 {{filtered}} 筆', 'Raw {{raw}} / deduped {{deduped}} / filtered {{filtered}}', 'Gốc {{raw}} / bỏ trùng {{deduped}} / sau lọc {{filtered}}', 'မူရင်း {{raw}} / မထပ် {{deduped}} / စစ်ပြီး {{filtered}}', 'ดิบ {{raw}} / ตัดซ้ำ {{deduped}} / หลังกรอง {{filtered}}', 'Mentah {{raw}} / dedupe {{deduped}} / tersaring {{filtered}}', 'Mentah {{raw}} / nyahduplikasi {{deduped}} / ditapis {{filtered}}', 'ដើម {{raw}} / លុបស្ទួន {{deduped}} / ក្រោយតម្រង {{filtered}}'],
  'market.noResults': ['还没有调研结果，输入关键词后开始搜索。', '還沒有調研結果，輸入關鍵字後開始搜尋。', 'No research results yet. Enter a keyword and start searching.', 'Chưa có kết quả. Nhập từ khóa rồi bắt đầu tìm.', 'သုတေသနရလဒ်မရှိသေးပါ။ keyword ထည့်ပြီးရှာပါ။', 'ยังไม่มีผลวิจัย กรอกคีย์เวิร์ดแล้วเริ่มค้นหา', 'Belum ada hasil riset. Masukkan kata kunci lalu cari.', 'Tiada keputusan kajian lagi. Masukkan kata kunci dan mula cari.', 'មិនទាន់មានលទ្ធផលស្រាវជ្រាវ។ បញ្ចូលពាក្យគន្លឹះ ហើយចាប់ផ្តើមស្វែងរក។'],
  'market.needKeyword': ['请输入搜索关键词', '請輸入搜尋關鍵字', 'Enter a search keyword', 'Nhập từ khóa tìm kiếm', 'ရှာဖွေရန် keyword ထည့်ပါ', 'กรอกคีย์เวิร์ดค้นหา', 'Masukkan kata kunci pencarian', 'Masukkan kata kunci carian', 'បញ្ចូលពាក្យគន្លឹះស្វែងរក'],
  'market.needAccount': ['请选择调研账号', '請選擇調研帳號', 'Select a research account', 'Chọn tài khoản nghiên cứu', 'သုတေသနအကောင့်ရွေးပါ', 'เลือกบัญชีวิจัย', 'Pilih akun riset', 'Pilih akaun kajian', 'ជ្រើសគណនីស្រាវជ្រាវ'],
  'market.researchFailed': ['市场调研失败', '市場調研失敗', 'Market research failed', 'Nghiên cứu thất bại', 'စျေးကွက်သုတေသနမအောင်မြင်', 'วิจัยตลาดไม่สำเร็จ', 'Riset pasar gagal', 'Kajian pasaran gagal', 'ស្រាវជ្រាវទីផ្សារបរាជ័យ'],
  'market.resumeFailed': ['恢复市场调研失败', '恢復市場調研失敗', 'Failed to resume market research', 'Tiếp tục nghiên cứu thất bại', 'သုတေသနပြန်စမှုမအောင်မြင်', 'กลับมาวิจัยต่อไม่สำเร็จ', 'Gagal melanjutkan riset pasar', 'Gagal menyambung kajian pasaran', 'បន្តស្រាវជ្រាវទីផ្សារបរាជ័យ'],
  'market.contactFailedError': ['自动沟通失败', '自動溝通失敗', 'Auto contact failed', 'Tự liên hệ thất bại', 'အလိုအလျောက်ဆက်သွယ်မှုမအောင်မြင်', 'ติดต่ออัตโนมัติไม่สำเร็จ', 'Kontak otomatis gagal', 'Hubungi automatik gagal', 'ទាក់ទងស្វ័យប្រវត្តិបរាជ័យ'],
  'market.pollFailed': ['查询自动沟通进度失败', '查詢自動溝通進度失敗', 'Failed to query auto contact progress', 'Truy vấn tiến độ liên hệ thất bại', 'auto contact တိုးတက်မှုမေးမြန်းမရ', 'สอบถามความคืบหน้าติดต่ออัตโนมัติไม่สำเร็จ', 'Gagal mengecek progres kontak otomatis', 'Gagal menyemak kemajuan hubungi automatik', 'ពិនិត្យវឌ្ឍនភាពទាក់ទងស្វ័យប្រវត្តិបរាជ័យ'],
  'market.noContactable': ['当前没有可自动沟通的优质商家，请先放宽筛选条件或重新调研。', '目前沒有可自動溝通的優質商家，請先放寬篩選條件或重新調研。', 'No quality sellers are ready for auto contact. Loosen filters or run research again.', 'Chưa có người bán chất lượng có thể tự liên hệ. Hãy nới điều kiện hoặc nghiên cứu lại.', 'အလိုအလျောက်ဆက်သွယ်နိုင်သောအရည်အသွေးရောင်းသူမရှိပါ။ filter လျှော့ သို့မဟုတ် ပြန်သုတေသနလုပ်ပါ။', 'ยังไม่มีผู้ขายคุณภาพที่ติดต่ออัตโนมัติได้ โปรดผ่อนเงื่อนไขหรือวิจัยใหม่', 'Belum ada penjual berkualitas yang siap dikontak otomatis. Longgarkan filter atau riset ulang.', 'Tiada penjual berkualiti yang sedia dihubungi automatik. Longgarkan penapis atau jalankan kajian semula.', 'មិនមានអ្នកលក់គុណភាពដែលអាចទាក់ទងស្វ័យប្រវត្តិ។ សូមបន្ធូរតម្រង ឬស្រាវជ្រាវឡើងវិញ។'],
  'market.confirmContact': ['确认自动沟通前 {{count}} 位优质商家吗？系统会按顺序逐个发消息。', '確認自動溝通前 {{count}} 位優質商家嗎？系統會依序逐一發訊息。', 'Auto contact the top {{count}} quality sellers? Messages will be sent one by one.', 'Tự liên hệ {{count}} người bán chất lượng đầu? Hệ thống sẽ gửi tin lần lượt.', 'ထိပ်ဆုံး {{count}} အရည်အသွေးရောင်းသူများကို အလိုအလျောက်ဆက်သွယ်မလား? စနစ်က တစ်ဦးချင်းစာပို့မည်။', 'ยืนยันติดต่อผู้ขายคุณภาพ {{count}} อันดับแรกอัตโนมัติหรือไม่? ระบบจะส่งทีละคนตามลำดับ', 'Hubungi otomatis {{count}} penjual berkualitas teratas? Sistem mengirim pesan satu per satu.', 'Hubungi automatik {{count}} penjual berkualiti teratas? Sistem menghantar mesej satu demi satu.', 'ទាក់ទងស្វ័យប្រវត្តិអ្នកលក់គុណភាពកំពូល {{count}} ឬ? ប្រព័ន្ធនឹងផ្ញើសារម្តងម្នាក់។'],
  'common.quantityValue': ['数量: {{count}}', '數量：{{count}}', 'Quantity: {{count}}', 'Số lượng: {{count}}', 'အရေအတွက်: {{count}}', 'จำนวน: {{count}}', 'Jumlah: {{count}}', 'Kuantiti: {{count}}', 'ចំនួន៖ {{count}}'],
  'product.confirmDelete': ['确认删除商品"{{name}}"吗？', '確認刪除商品「{{name}}」嗎？', 'Delete product "{{name}}"?', 'Xóa sản phẩm "{{name}}"?', 'ကုန်ပစ္စည်း "{{name}}" ကိုဖျက်မလား?', 'ลบสินค้า "{{name}}" หรือไม่?', 'Hapus produk "{{name}}"?', 'Padam produk "{{name}}"?', 'លុបផលិតផល "{{name}}" ឬ?'],
  'request.unauthorized': ['未授权，请重新登录', '未授權，請重新登入', 'Unauthorized. Please sign in again.', 'Chưa được ủy quyền. Vui lòng đăng nhập lại.', 'ခွင့်မပြုထားပါ။ ပြန်ဝင်ပါ။', 'ไม่มีสิทธิ์ โปรดเข้าสู่ระบบอีกครั้ง', 'Tidak berwenang. Silakan masuk lagi.', 'Tidak dibenarkan. Sila log masuk semula.', 'គ្មានសិទ្ធិ។ សូមចូលម្ដងទៀត។'],
  'request.failedStatus': ['请求失败 ({{status}})', '請求失敗 ({{status}})', 'Request failed ({{status}})', 'Yêu cầu thất bại ({{status}})', 'တောင်းဆိုမှုမအောင်မြင် ({{status}})', 'คำขอล้มเหลว ({{status}})', 'Permintaan gagal ({{status}})', 'Permintaan gagal ({{status}})', 'សំណើបរាជ័យ ({{status}})'],
  'request.operationFailed': ['操作失败', '操作失敗', 'Operation failed', 'Thao tác thất bại', 'လုပ်ဆောင်မှုမအောင်မြင်', 'ดำเนินการไม่สำเร็จ', 'Operasi gagal', 'Operasi gagal', 'ប្រតិបត្តិការបរាជ័យ'],
  'image.avatarFallback': ['账号', '帳號', 'Account', 'Tài khoản', 'အကောင့်', 'บัญชี', 'Akun', 'Akaun', 'គណនី'],
  'image.productFallbackTitle': ['鱼鱼商品', '魚魚商品', 'Yuyu Product', 'Sản phẩm Yuyu', 'Yuyu ကုန်ပစ္စည်း', 'สินค้า Yuyu', 'Produk Yuyu', 'Produk Yuyu', 'ផលិតផល Yuyu'],
  'image.noImage': ['暂无图片', '暫無圖片', 'No image', 'Chưa có ảnh', 'ပုံမရှိသေးပါ', 'ยังไม่มีรูป', 'Belum ada gambar', 'Tiada imej', 'មិនទាន់មានរូបភាព'],
  'image.missingAutoFilled': ['图片缺失，已自动补位', '圖片缺失，已自動補位', 'Image missing, placeholder added', 'Thiếu ảnh, đã tự thêm ảnh thay thế', 'ပုံမရှိ၍ placeholder ထည့်ပြီး', 'ไม่มีรูป จึงเติมรูปแทนอัตโนมัติ', 'Gambar hilang, placeholder ditambahkan', 'Imej tiada, ruang ganti ditambah', 'ខ្វះរូបភាព បានបន្ថែមរូបជំនួស'],
  'image.preview': ['图片预览', '圖片預覽', 'Image preview', 'Xem trước ảnh', 'ပုံကြိုကြည့်', 'ตัวอย่างรูป', 'Pratinjau gambar', 'Pratonton imej', 'មើលរូបជាមុន'],
  'image.loadFailed': ['加载失败', '載入失敗', 'Load failed', 'Tải thất bại', 'ဖွင့်မရပါ', 'โหลดไม่สำเร็จ', 'Gagal memuat', 'Gagal memuatkan', 'ផ្ទុកបរាជ័យ'],
  'api.accountNickname': ['账号 {{id}}', '帳號 {{id}}', 'Account {{id}}', 'Tài khoản {{id}}', 'အကောင့် {{id}}', 'บัญชี {{id}}', 'Akun {{id}}', 'Akaun {{id}}', 'គណនី {{id}}'],
  'api.aiTestMessage': ['你好，这是一条测试消息', '你好，這是一條測試訊息', 'Hello, this is a test message', 'Xin chào, đây là tin nhắn thử nghiệm', 'မင်္ဂလာပါ၊ ဒါက စမ်းသပ်စာတိုပါ', 'สวัสดี นี่คือข้อความทดสอบ', 'Halo, ini pesan uji coba', 'Helo, ini mesej ujian', 'សួស្តី នេះជាសារសាកល្បង'],
  'api.aiReply': ['AI 回复: {{reply}}', 'AI 回覆：{{reply}}', 'AI reply: {{reply}}', 'AI trả lời: {{reply}}', 'AI ပြန်ကြားချက်: {{reply}}', 'AI ตอบกลับ: {{reply}}', 'Balasan AI: {{reply}}', 'Balasan AI: {{reply}}', 'ការឆ្លើយតប AI៖ {{reply}}'],
  'api.aiConnectionSuccess': ['AI 连接测试成功', 'AI 連線測試成功', 'AI connection test succeeded', 'Kiểm tra kết nối AI thành công', 'AI ချိတ်ဆက်မှုစမ်းသပ်ချက်အောင်မြင်', 'ทดสอบการเชื่อมต่อ AI สำเร็จ', 'Tes koneksi AI berhasil', 'Ujian sambungan AI berjaya', 'តេស្តការតភ្ជាប់ AI ជោគជ័យ'],
  'settings.modelQwenPlus': ['通义千问 Plus', '通義千問 Plus', 'Qwen Plus', 'Qwen Plus', 'Qwen Plus', 'Qwen Plus', 'Qwen Plus', 'Qwen Plus', 'Qwen Plus'],
  'settings.modelQwenTurbo': ['通义千问 Turbo', '通義千問 Turbo', 'Qwen Turbo', 'Qwen Turbo', 'Qwen Turbo', 'Qwen Turbo', 'Qwen Turbo', 'Qwen Turbo', 'Qwen Turbo'],
  'settings.dashscopeService': ['阿里云通义千问', '阿里雲通義千問', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope', 'Alibaba Cloud DashScope'],
  'market.csv.priceText': ['价格文本', '價格文字', 'Price text', 'Văn bản giá', 'ဈေးနှုန်းစာသား', 'ข้อความราคา', 'Teks harga', 'Teks harga', 'អត្ថបទតម្លៃ'],
  'market.csv.priceValue': ['价格数值', '價格數值', 'Price value', 'Giá trị giá', 'ဈေးနှုန်းတန်ဖိုး', 'ค่าราคา', 'Nilai harga', 'Nilai harga', 'តម្លៃជាលេខ'],
  'market.csv.mainImage': ['主图', '主圖', 'Main image', 'Ảnh chính', 'ပင်မပုံ', 'รูปหลัก', 'Gambar utama', 'Imej utama', 'រូបភាពចម្បង'],
  'market.csv.batteryHealth': ['电池健康', '電池健康', 'Battery health', 'Sức khỏe pin', 'ဘက်ထရီအခြေအနေ', 'สุขภาพแบตเตอรี่', 'Kesehatan baterai', 'Kesihatan bateri', 'សុខភាពថ្ម'],
  'market.csv.wantCount': ['想要人数', '想要人數', 'Want count', 'Số người muốn', 'လိုချင်သူအရေအတွက်', 'จำนวนคนอยากได้', 'Jumlah peminat', 'Bilangan berminat', 'ចំនួនអ្នកចង់បាន'],
  'market.csv.publishedAt': ['发布时间', '發布時間', 'Published at', 'Thời gian đăng', 'တင်ချိန်', 'เวลาเผยแพร่', 'Waktu terbit', 'Masa diterbitkan', 'ពេលផ្សព្វផ្សាយ'],
  'market.csv.link': ['链接', '連結', 'Link', 'Liên kết', 'လင့်ခ်', 'ลิงก์', 'Tautan', 'Pautan', 'តំណ'],
  'test.title': ['测试页面', '測試頁面', 'Test Page', 'Trang kiểm thử', 'စမ်းသပ်စာမျက်နှာ', 'หน้าทดสอบ', 'Halaman Uji', 'Halaman Ujian', 'ទំព័រសាកល្បង'],
  'test.description': ['如果你能看到这个页面，说明基础功能正常。', '如果你能看到這個頁面，代表基礎功能正常。', 'If you can see this page, the basic app shell is working.', 'Nếu bạn thấy trang này, chức năng cơ bản đang hoạt động.', 'ဤစာမျက်နှာကိုမြင်ရပါက အခြေခံလုပ်ဆောင်ချက်အလုပ်လုပ်နေပါသည်။', 'หากเห็นหน้านี้ แสดงว่าฟังก์ชันพื้นฐานทำงานปกติ', 'Jika halaman ini terlihat, fungsi dasar berjalan normal.', 'Jika halaman ini kelihatan, fungsi asas berjalan normal.', 'បើអ្នកឃើញទំព័រនេះ មុខងារមូលដ្ឋានដំណើរការធម្មតា។'],
  'test.blueCard': ['蓝色卡片', '藍色卡片', 'Blue card', 'Thẻ xanh dương', 'အပြာရောင်ကတ်', 'การ์ดสีน้ำเงิน', 'Kartu biru', 'Kad biru', 'កាតពណ៌ខៀវ'],
  'test.greenCard': ['绿色卡片', '綠色卡片', 'Green card', 'Thẻ xanh lá', 'အစိမ်းရောင်ကတ်', 'การ์ดสีเขียว', 'Kartu hijau', 'Kad hijau', 'កាតពណ៌បៃតង'],
  'test.yellowCard': ['黄色卡片', '黃色卡片', 'Yellow card', 'Thẻ vàng', 'အဝါရောင်ကတ်', 'การ์ดสีเหลือง', 'Kartu kuning', 'Kad kuning', 'កាតពណ៌លឿង'],
};

const dictionaries = languageOrder.reduce((acc, language, index) => {
  acc[language] = Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, value[index]]),
  );
  return acc;
}, {} as Record<LanguageCode, Dictionary>);

export const isLanguageCode = (value: string | null | undefined): value is LanguageCode =>
  Boolean(value && languageOrder.includes(value as LanguageCode));

export const detectLanguage = (input?: readonly string[] | string): LanguageCode => {
  const candidates = Array.isArray(input)
    ? input
    : input
      ? [input]
      : typeof navigator !== 'undefined'
        ? [navigator.language, ...(navigator.languages || [])]
        : [];

  for (const raw of candidates) {
    const normalized = raw.toLowerCase();
    if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo') || normalized.startsWith('zh-hant')) return 'zh-Hant';
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('en')) return 'en';
    if (normalized.startsWith('vi')) return 'vi';
    if (normalized.startsWith('my') || normalized.startsWith('bm')) return 'my';
    if (normalized.startsWith('th')) return 'th';
    if (normalized.startsWith('id')) return 'id';
    if (normalized.startsWith('ms')) return 'ms';
    if (normalized.startsWith('km')) return 'km';
  }

  return 'zh';
};

const getStoredLanguage = (): LanguageCode | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLanguageCode(stored) ? stored : null;
};

let runtimeLanguage: LanguageCode | null = null;

export const getCurrentLanguageCode = (): LanguageCode => runtimeLanguage || getStoredLanguage() || detectLanguage();

const interpolate = (template: string, params?: Params) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => {
    const value = params?.[name];
    return value === null || value === undefined ? '' : String(value);
  });

export const translateForLanguage = (language: LanguageCode, key: string, params?: Params): string => {
  let template = dictionaries[language]?.[key];

  if (!template && language === 'zh-Hant') {
    template = dictionaries.zh[key];
  }

  if (!template && language !== 'zh' && language !== 'zh-Hant') {
    template = dictionaries.en[key];
  }

  return interpolate(template || key, params);
};

export const translate = (key: string, params?: Params): string =>
  translateForLanguage(getCurrentLanguageCode(), key, params);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLanguageIndex = (language: LanguageCode) => Math.max(languageOrder.indexOf(language), 0);
const exactDomMapCache = new Map<LanguageCode, Map<string, string>>();
const templateDomRuleCache = new Map<LanguageCode, Array<{ regex: RegExp; variables: string[]; target: string }>>();
const placeholderPattern = /{{\s*(\w+)\s*}}/g;

const getExactDomMap = (language: LanguageCode) => {
  const cached = exactDomMapCache.get(language);
  if (cached) return cached;

  const targetIndex = getLanguageIndex(language);
  const map = new Map<string, string>();
  Object.values(entries).forEach((entry) => {
    const target = entry[targetIndex];
    entry.forEach((source) => {
      if (source && target && source !== target && !source.includes('{{')) {
        map.set(source, target);
      }
    });
  });

  exactDomMapCache.set(language, map);
  return map;
};

const compileTemplateRule = (source: string, target: string) => {
  const variables: string[] = [];
  let pattern = '^';
  let lastIndex = 0;

  source.replace(placeholderPattern, (match, variable: string, offset: number) => {
    pattern += escapeRegExp(source.slice(lastIndex, offset));
    pattern += '(.+?)';
    variables.push(variable);
    lastIndex = offset + match.length;
    return match;
  });

  pattern += escapeRegExp(source.slice(lastIndex));
  pattern += '$';
  return { regex: new RegExp(pattern), variables, target };
};

const getTemplateDomRules = (language: LanguageCode) => {
  const cached = templateDomRuleCache.get(language);
  if (cached) return cached;

  const targetIndex = getLanguageIndex(language);
  const rules: Array<{ regex: RegExp; variables: string[]; target: string }> = [];
  Object.values(entries).forEach((entry) => {
    const target = entry[targetIndex];
    entry.forEach((source) => {
      if (source && target && source !== target && source.includes('{{')) {
        rules.push(compileTemplateRule(source, target));
      }
    });
  });

  templateDomRuleCache.set(language, rules);
  return rules;
};

const translateDomText = (value: string, language: LanguageCode) => {
  if (!value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] || '';
  const trailing = value.match(/\s*$/)?.[0] || '';
  const trimmed = value.trim();

  const exact = getExactDomMap(language).get(trimmed);
  if (exact) return `${leading}${exact}${trailing}`;

  for (const rule of getTemplateDomRules(language)) {
    const match = trimmed.match(rule.regex);
    if (!match) continue;
    const params = Object.fromEntries(rule.variables.map((variable, index) => [variable, match[index + 1]]));
    return `${leading}${interpolate(rule.target, params)}${trailing}`;
  }

  return value;
};

const shouldSkipDomNode = (node: Node) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('script, style, textarea, input, select, option, [data-i18n-skip]'));
};

const translateStaticDom = (language: LanguageCode) => {
  if (typeof document === 'undefined' || !document.body) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => shouldSkipDomNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  textNodes.forEach((node) => {
    const nextValue = translateDomText(node.nodeValue || '', language);
    if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
  });

  document.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label], [alt]').forEach((element) => {
    if (element.closest('script, style, [data-i18n-skip]')) return;
    ['placeholder', 'title', 'aria-label', 'alt'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const nextValue = translateDomText(value, language);
      if (nextValue !== value) element.setAttribute(attribute, nextValue);
    });
  });
};

type I18nContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string, params?: Params) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const initialLanguage = getStoredLanguage() || detectLanguage();
    runtimeLanguage = initialLanguage;
    return initialLanguage;
  });

  const setLanguage = (nextLanguage: LanguageCode) => {
    runtimeLanguage = nextLanguage;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    }
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    runtimeLanguage = language;
    if (window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, language);
    }
    document.documentElement.lang = language;
    document.title = translateForLanguage(language, 'meta.title');
    window.requestAnimationFrame(() => translateStaticDom(language));
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) {
      description.content = translateForLanguage(language, 'meta.description');
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translateForLanguage(language, key, params),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
};
