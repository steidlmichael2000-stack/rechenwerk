package de.rechenwerk.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Systemweite Schriftgröße nicht auf die Web-Oberfläche anwenden – sonst laufen die
        // Tastenbeschriftungen über. Die Oberfläche skaliert selbst mit der Bildschirmbreite.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
