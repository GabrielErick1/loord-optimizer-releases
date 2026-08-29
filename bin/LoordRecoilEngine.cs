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

        [DllImport("winmm.dll")]
        public static extern uint timeBeginPeriod(uint uMilliseconds);

        private const int MOUSEEVENTF_MOVE = 0x0001;
        private const int VK_LBUTTON = 0x01; // Botao Esquerdo (Atirar / Disparo)

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
                    if (parsed > 0.0) speed = parsed;
                }
            }

            if (speed < 0.1) speed = 0.1;
            if (speed > 50.0) speed = 50.0;

            bool macroAtiva = false;
            double accumY = 0.0;
            string configSpeedPath = Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt");
            string configActivePath = Path.Combine(Path.GetTempPath(), "loord_macro_active.txt");
            int loopCounter = 0;

            while (true)
            {
                loopCounter++;

                // Sincroniza estado e velocidade com o painel a cada ~30ms
                if (loopCounter % 3 == 0)
                {
                    string actText = SafeReadAllText(configActivePath);
                    if (!string.IsNullOrEmpty(actText))
                    {
                        string act = actText.Trim().ToLower();
                        if (act == "true" || act == "1") macroAtiva = true;
                        else if (act == "false" || act == "0") macroAtiva = false;
                    }

                    string spdText = SafeReadAllText(configSpeedPath);
                    if (!string.IsNullOrEmpty(spdText))
                    {
                        string cfg = spdText.Trim().Replace(',', '.');
                        double newSpd;
                        if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd))
                        {
                            if (newSpd >= 0.05 && newSpd <= 50.0)
                            {
                                speed = newSpd;
                            }
                        }
                    }
                }

                if (macroAtiva)
                {
                    // Verifica se o botao esquerdo do mouse esta pressionado
                    bool isShooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                    if (isShooting)
                    {
                        // Calibragem precisa para emulador e Free Fire:
                        // 0.1: ~0.35 px/s (Ultra lenta, micro-puxada quase imperceptivel para firmar mira)
                        // 0.2: ~0.70 px/s (Bem lenta)
                        // 0.5: ~1.75 px/s (Suave e constante)
                        // 1.0: ~3.50 px/s (Recomendada/Equilibrada)
                        // 2.5: ~8.75 px/s (Media)
                        // 5.0: ~17.5 px/s (Forte)
                        // 10.0: ~35.0 px/s (Rapida/Maxima)
                        accumY += (speed * 0.035);

                        if (accumY >= 1.0)
                        {
                            int stepY = (int)Math.Floor(accumY);
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                            accumY -= stepY;
                        }

                        Thread.Sleep(10);
                    }
                    else
                    {
                        accumY = 0.0;
                        Thread.Sleep(10);
                    }
                }
                else
                {
                    accumY = 0.0;
                    Thread.Sleep(20);
                }
            }
        }

        private static string SafeReadAllText(string path)
        {
            if (!File.Exists(path)) return null;
            for (int i = 0; i < 3; i++)
            {
                try
                {
                    using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    using (var reader = new StreamReader(fs))
                    {
                        return reader.ReadToEnd();
                    }
                }
                catch
                {
                    Thread.Sleep(2);
                }
            }
            return null;
        }
    }
}
