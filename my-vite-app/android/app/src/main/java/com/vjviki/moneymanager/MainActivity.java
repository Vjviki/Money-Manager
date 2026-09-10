package com.vjviki.moneymanager;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DetectedTransactionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
