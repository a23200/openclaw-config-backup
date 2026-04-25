-- 新增 length_tier 列:V1 体量档标记
-- 取值:'' / 'short' / 'standard' / 'epic' / 'article'
-- 空串表示未使用体量档(旧数据默认);'article' 走精简管线(跳过 Bible/Knowledge/记忆引擎)

ALTER TABLE novels ADD COLUMN length_tier TEXT NOT NULL DEFAULT '';
