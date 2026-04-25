# Android 生成反复失败原因汇总（2026-04-21）

## 结论

这些次失败，不是单一问题反复出现，而是 Android 代码生成链路会持续冒出新的 Kotlin / Compose / Gradle 错误模式。  
已经修掉的是“已识别类型”；用户一换项目或题材，模型又可能生成新的未覆盖模式，于是继续在编译阶段失败。

## 已反复出现的失败类别

1. **首次编译前缺少预修复**
   - 必须先做静态预编译修复，不能只等 Gradle 失败后补救。
   - 参考：`.learnings/LEARNINGS.md` 中 `LRN-20260421-001`

2. **Gradle 依赖污染**
   - 模型会生成重复、无效或不存在的 AndroidX / Compose 依赖。
   - 参考：`.learnings/LEARNINGS.md` 中 `LRN-20260421-002`

3. **Compose 协程与回调误用**
   - 常见于 `rememberCoroutineScope()`、`launch`、suspend 回调调用位置错误。
   - 参考：`.learnings/LEARNINGS.md` 中 `LRN-20260421-003`

4. **本地 import / 包路径 / 假 API**
   - 项目内类 import 指向错误包路径，或者模型捏造不存在的 Material3 API。
   - 参考：`.learnings/LEARNINGS.md` 中 `LRN-20260421-004`

5. **`UiState` 泛型类型坍塌**
   - 修 `is UiState.Success` 时，如果只补 `Success<*>` 而不恢复 `state.data` 的真实类型，就会把字段访问全擦成 `Any?`。
   - 参考：`.learnings/ERRORS.md` 中 `ERR-20260421-001`

6. **流程验证不完整**
   - 只修单个 temp 项目并不能证明生成器已防复发；必须把修复做进生成器并重跑完整链路。
   - 参考：`.learnings/ERRORS.md` 中 `ERR-20260421-002`

## 当前项目再次暴露的新错误模式

项目 ID：`9be414d7-64a9-49cb-bb33-253310169d60`

### 1. Flow API 调用方式错误
- 文件：`temp/9be414d7-64a9-49cb-bb33-253310169d60/app/src/main/java/com/example/qingjirichang/data/Repositories.kt`
- 位置：第 99 行附近
- 现象：
  - `kotlinx.coroutines.flow.first(flow)` 写法错误
  - 导致 `session.loggedIn`、`session.userId` 连锁报错

### 2. Compose `dp` 写法错误
- 文件：`temp/9be414d7-64a9-49cb-bb33-253310169d60/app/src/main/java/com/example/qingjirichang/ui/AppNav.kt`
- 位置：第 159 行
- 现象：
  - 生成成 `androidx.compose.ui.unit.dp(16)`
  - 正常应为 `16.dp`

### 3. `context` 作用域错误
- 文件：`temp/9be414d7-64a9-49cb-bb33-253310169d60/app/src/main/java/com/example/qingjirichang/ui/Screens.kt`
- 位置：
  - 定义：第 289 行
  - 错误使用：第 326、327、331、332、336、337、341、342 行
- 现象：
  - `context` 被定义在 `if (recordId == null)` 分支里
  - 但在分支外继续使用，导致 `Unresolved reference: context`

### 4. `UiState` 泛型推断过窄
- 文件：`temp/9be414d7-64a9-49cb-bb33-253310169d60/app/src/main/java/com/example/qingjirichang/ui/ViewModels.kt`
- 位置：第 31、281、322 行附近
- 现象：
  - 流被推断成 `UiState.Success<T>`
  - `.catch { emit(UiState.Error(...)) }` 时无法接收 `Error`
  - 最终报 `Type mismatch`

## 本质原因

反复失败的真正原因不是用户操作问题，也不是 Gradle 环境一直坏，而是：

- 模型在不同项目里会生成不同类型的 Kotlin / Compose / Gradle 错误；
- 当前生成器的预修复规则仍然是“见一个补一个”；
- 所以旧问题修好后，新项目仍会暴露新的未覆盖错误模式。

## 以后判断方法

如果再次看到“生成好了但又失败”，先判断是哪一类：

1. 生成流断开但后端回退普通模式；
2. 代码生成完成，但 Kotlin 编译阶段失败；
3. AI repair 已执行，但留下新的未覆盖错误模式；
4. 只是 temp 项目修好了，但生成器本体还没吸收这次经验。

## 本文件用途

这个文件用于总结“为什么会反复失败”，不是某一次临时修复记录。  
后续每出现一种新的高频失败模式，都应追加到这里，并同步决定是否加入生成器预修复链路。
