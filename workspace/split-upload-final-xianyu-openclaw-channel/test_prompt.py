import yaml
with open('global_config.yml', 'r', encoding='utf-8') as f:
    config = yaml.safe_load(f)
print(config.get('ai_settings', {}).get('custom_prompts', {}))
