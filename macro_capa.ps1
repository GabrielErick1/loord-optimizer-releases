# Macro de Controle de Recoil - Puxada Y Suave para Baixo (Descida de Mira)
# Suporta velocidades decimais fracionadas (ex: 0.1, 0.5, 1.0, 2.5) para micro-ajustes
# Atalhos Globais: F2, F3, F6 ou F7 (Liga/Desliga com sinal sonoro)
param(
    [double]$Velocidade = 0.5
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class MacroEngine {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    private const int MOUSEEVENTF_MOVE = 0x0001;
    private const int VK_LBUTTON = 0x01; // Botao esquerdo do mouse (Atirar)
    private const int VK_F2      = 0x71; // Tecla F2
    private const int VK_F3      = 0x72; // Tecla F3
    private const int VK_F6      = 0x75; // Tecla F6
    private const int VK_F7      = 0x76; // Tecla F7

    public static void Run(double speed) {
        if (speed <= 0.0) speed = 0.5;

        double accumY = 0.0;
        bool macroAtiva = true; // Inicia ATIVA

        while (true) {
            // Verifica atalhos de Toggle: F2, F3, F6 ou F7
            bool f2 = (GetAsyncKeyState(VK_F2) & 0x8000) != 0;
            bool f3 = (GetAsyncKeyState(VK_F3) & 0x8000) != 0;
            bool f6 = (GetAsyncKeyState(VK_F6) & 0x8000) != 0;
            bool f7 = (GetAsyncKeyState(VK_F7) & 0x8000) != 0;

            if (f2 || f3 || f6 || f7) {
                macroAtiva = !macroAtiva;
                try { Console.Beep(macroAtiva ? 1200 : 500, 120); } catch {}
                Thread.Sleep(300); // Debounce para evitar duplo clique
            }

            if (macroAtiva) {
                bool shooting = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
                if (shooting) {
                    accumY += speed;
                    if (accumY >= 1.0) {
                        int stepY = (int)Math.Floor(accumY);
                        // Valor positivo em Y = move o cursor para BAIXO (Desce a mira suavemente)
                        mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                        accumY -= stepY;
                    }
                    Thread.Sleep(7);
                } else {
                    accumY = 0.0;
                    Thread.Sleep(5);
                }
            } else {
                Thread.Sleep(20);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[MacroEngine]::Run($Velocidade)
