@echo off
REM Double-click launcher for Class Meet.
REM
REM Exactly the same thing as running `npm run up` in a terminal, but it works
REM from File Explorer: it moves to its own folder first, so it does not matter
REM what directory Windows starts it in, and it pauses at the end so that a
REM failure stays on screen instead of a window that blinks and disappears.

cd /d "%~dp0"

call npm run up

echo.
echo Class Meet has stopped.
pause
