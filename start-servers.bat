@echo off
echo Starting Qualitas Development Servers...
echo.

echo Starting Python Backend (Port 8000)...
start "Qualitas Python Backend" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

timeout /t 3

echo Starting Node Backend (Port 3001)...
start "Qualitas Node Backend" cmd /k "cd backend && npm start"

timeout /t 3

echo Starting React Frontend (Port 3000)...
start "Qualitas React Frontend" cmd /k "cd react-app && npm run dev"

echo.
echo All servers launched in separate windows.
echo Please check the new windows for any error messages if the app doesn't load.
echo Frontend should be available at http://localhost:3000
echo.
pause
