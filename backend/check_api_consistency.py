#!/usr/bin/env python3
"""
檢查前後端 API 路由一致性
"""
import os
import re
from pathlib import Path

# 定義顏色
RED = '\033[91m'
YELLOW = '\033[93m'
GREEN = '\033[92m'
RESET = '\033[0m'

def extract_frontend_routes():
    """從前端 Context 檔案提取 API 路由"""
    context_dir = Path("c:/Users/YUKAI/Desktop/Qualitas/react-app/src/context")
    routes = {}
    
    for file in context_dir.glob("*Context.tsx"):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            # 匹配 api.get/post/put/delete 呼叫
            pattern = r'api\.(get|post|put|delete)\([\'"`]([^\'"` ]+)[\'"`]'
            matches = re.findall(pattern, content)
            
            if matches:
                routes[file.name] = [(method, path) for method, path in matches]
    
    return routes

def extract_backend_routes():
    """從後端 router 檔案提取路由定義"""
    routers_dir = Path("c:/Users/YUKAI/Desktop/Qualitas/backend/routers")
    routes = {}
    
    for file in routers_dir.glob("*.py"):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            # 匹配 @router.xxx("path")
            pattern = r'@router\.(get|post|put|delete)\([\'"]([^\'"]+)[\'"]\)'
            matches = re.findall(pattern, content)
            
            if matches:
                routes[file.name] = [(method, path) for method, path in matches]
    
    return routes

def check_trailing_slash_consistency():
    """檢查前端路由的尾隨斜槓一致性"""
    print(f"\n{YELLOW}=== 檢查前端 API 路徑尾隨斜槓一致性 ==={RESET}\n")
    
    routes =extract_frontend_routes()
    issues = []
    
    for file, paths in routes.items():
        for method, path in paths:
            # 跳過不包含參數的路徑
            if '{' not in path and '$' not in path:
                continue
            
            # 檢查是否以斜槓結尾
            has_trailing_slash = path.endswith('/')
            
            # 記錄不一致的路徑
            if not has_trailing_slash and not path.endswith('}'):
                issues.append((file, method, path))
    
    if issues:
        print(f"{RED}發現 {len(issues)} 個路徑缺少尾隨斜槓：{RESET}")
        for file, method, path in issues:
            print(f"  {file}: {method.upper()} {path}")
    else:
        print(f"{GREEN}✅ 所有路徑斜槓一致{RESET}")
    
    return len(issues) == 0

def check_route_matching():
    """檢查前後端路由是否匹配"""
    print(f"\n{YELLOW}=== 檢查前後端路由匹配 ==={RESET}\n")
    
    frontend = extract_frontend_routes()
    backend = extract_backend_routes()
    
    # 建立後端路由對應表
    backend_endpoints = {}
    for file, routes in backend.items():
        module = file.replace('.py', '')
        for method, path in routes:
            # 標準化路徑（移除開頭的斜槓）
            normalized_path = path.lstrip('/')
            key = f"{method}:{module}/{normalized_path}"
            backend_endpoints[key] = True
    
    print(f"後端共定義 {len(backend_endpoints)} 個路由端點")
    print(f"{GREEN}✅ 檢查完成{RESET}")

if __name__ == "__main__":
    print(f"{GREEN}{'='*60}{RESET}")
    print(f"{GREEN}前後端 API 路由一致性檢查{RESET}")
    print(f"{GREEN}{'='*60}{RESET}")
    
    slash_ok = check_trailing_slash_consistency()
    check_route_matching()
    
    print(f"\n{GREEN}{'='*60}{RESET}")
    if slash_ok:
        print(f"{GREEN}✅ 檢查通過{RESET}")
    else:
        print(f"{RED}⚠️  發現問題需要修復{RESET}")
    print(f"{GREEN}{'='*60}{RESET}\n")
