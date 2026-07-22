@echo off
setlocal
set ROOT=%~dp0
set CF=C:\Program Files\LLVM\bin\clang-format.exe

echo === C++ LINT (clang-format) ===
cd /d %ROOT%hft-trade-bot
if exist "%CF%" (
    for /R src %%f in (*.h *.cpp) do @"%CF%" --dry-run --Werror "%%f" 2>&1
    for /R tests %%f in (*.h *.cpp) do @"%CF%" --dry-run --Werror "%%f" 2>&1
    echo LINT DONE
) else (
    echo clang-format not found at "%CF%", skipping
)

echo.
echo === C++ BUILD (cmake) ===
cd /d %ROOT%hft-trade-bot
where cmake >nul 2>&1 && where ctest >nul 2>&1
if not errorlevel 1 (
    cmake -B build -S . -DCMAKE_BUILD_TYPE=Debug 2>&1
    if not errorlevel 1 (
        cmake --build build --config Debug -j 2>&1
        echo.
        echo === C++ TESTS (ctest) ===
        cd build
        ctest --output-on-failure -C Debug 2>&1
    ) else (
        echo cmake build failed, skipping tests
    )
) else (
    echo cmake or ctest not found on PATH, skipping C++ build and tests
)

echo.
echo DONE
pause
