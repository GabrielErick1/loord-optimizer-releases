using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace LoordOptimizer
{
    public static class Program
    {
        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern bool MessageBeep(uint uType);

        [DllImport("winmm.dll")]
        public static extern uint timeBeginPeriod(uint uMilliseconds);

        public struct POINT
        {
            public int X;
            public int Y;
        }

        private const int MOUSEEVENTF_MOVE = 0x0001;
        private const int VK_LBUTTON = 0x01; // Botao Esquerdo (Atirar / Disparo)
        private const int VK_F2      = 0x71;
        private const int VK_F3      = 0x72;
        private const int VK_F6      = 0x75;
        private const int VK_F7      = 0x76;
        private const int VK_F8      = 0x77;

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                timeBeginPeriod(1);
            }
            catch { }

            double speed = 0.5;
            if (args != null && args.Length > 0)
            {
                double parsed;
                if (double.TryParse(args[0].Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed))
                {
                    speed = parsed;
                }
            }

            if (speed <= 0.0) speed = 0.1;
            if (speed > 50.0) speed = 50.0;

            bool macroAtiva = true;
            try { MessageBeep(0); } catch { }

            double accumY = 0.0;
            string configPath = Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt");
            int loopCounter = 0;

            while (true)
            {
                loopCounter++;

                // Monitora atalhos de ligar/desligar: F7, F8, F2, F3, F6
                bool f7 = (GetAsyncKeyState(VK_F7) < 0);
                bool f8 = (GetAsyncKeyState(VK_F8) < 0);
                bool f2 = (GetAsyncKeyState(VK_F2) < 0);
                bool f3 = (GetAsyncKeyState(VK_F3) < 0);
                bool f6 = (GetAsyncKeyState(VK_F6) < 0);

                if (f7 || f8 || f2 || f3 || f6)
                {
                    macroAtiva = !macroAtiva;
                    try { MessageBeep(0); } catch { }
                    Thread.Sleep(300);
                }

                // Sincroniza velocidade atualizada em tempo real a cada ~100ms
                if (loopCounter % 20 == 0)
                {
                    try
                    {
                        if (File.Exists(configPath))
                        {
                            string cfg = File.ReadAllText(configPath).Trim().Replace(',', '.');
                            double newSpd;
                            if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd))
                            {
                                if (newSpd > 0.0) speed = newSpd;
                            }
                        }
                    }
                    catch { }
                }

                if (macroAtiva)
                {
                    // Verifica se o botao esquerdo do mouse esta pressionado
                    bool isShooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                    if (isShooting)
                    {
                        // Escala proporcional precisa:
                        // 0.1 = minima quase imperceptivel
                        // 0.5 = suave
                        // 1.0 = media
                        // 10.0 = maxima
                        accumY += (speed * 0.8);
                        if (accumY >= 1.0)
                        {
                            int stepY = (int)Math.Floor(accumY);

                            // 1) Envia movimento relativo para jogos 3D / DirectInput / Emuladores
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);

                            // 2) Ajusta cursor do Windows (garante movimento visual no Desktop / 2D)
                            POINT cur;
                            if (GetCursorPos(out cur))
                            {
                                SetCursorPos(cur.X, cur.Y + stepY);
                            }

                            accumY -= stepY;
                        }
                        Thread.Sleep(8);
                    }
                    else
                    {
                        accumY = 0.0;
                        Thread.Sleep(5);
                    }
                }
                else
                {
                    Thread.Sleep(20);
                }
            }
        }
    }
}
