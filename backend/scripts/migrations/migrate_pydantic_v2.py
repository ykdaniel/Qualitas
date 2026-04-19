"""
Migrate Pydantic V1 class Config syntax to V2 model_config
"""

import re

def migrate_schemas():
    with open('schemas.py', 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern to match:
    # class SomeSchema(...):
    #     ...fields...
    #     class Config:
    #         from_attributes = True

    pattern = r'(\s+)class Config:\n\1    from_attributes = True'
    replacement = r'\1model_config = {"from_attributes": True}'

    new_content = re.sub(pattern, replacement, content)

    # Count replacements
    old_count = content.count('class Config:')
    new_count = new_content.count('class Config:')
    replaced = old_count - new_count

    print(f"Found {old_count} 'class Config:' occurrences")
    print(f"Replaced {replaced} occurrences")
    print(f"Remaining: {new_count}")

    if replaced > 0:
        with open('schemas.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✅ schemas.py updated successfully")
    else:
        print("⚠️ No replacements made")

if __name__ == '__main__':
    migrate_schemas()
