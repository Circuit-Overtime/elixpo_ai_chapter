1. **Create a New Project**  
   - Open Android Studio → New Project  
   - Select **Empty Activity** and click **Next**  
   - Set Name, Package Name, and choose **Java** or **Kotlin**  
   - Click **Finish**

2. **Modify `AndroidManifest.xml` for Permissions**  
   - If using implicit intents (like opening a webpage or calling), add required permissions:
     ```xml
     <uses-permission android:name="android.permission.CALL_PHONE"/>
     ```

3. **Create Multiple Activities for Navigation**  
   - **MainActivity**: Contains buttons for navigation and implicit intent actions.  
   - **SecondActivity**: Receives and displays passed data.

4. **Implement UI in `activity_main.xml`**
   - Add **Buttons** for different intents and user actions.

---

### **Android Studio Code: Handling Intents & Event Listeners**

#### **MainActivity.java (Explicit & Implicit Intent)**
```java
package com.example.myapp;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    Button btnNavigate, btnCall, btnWeb;
    EditText etPhoneNumber, etMessage;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        btnNavigate = findViewById(R.id.btnNavigate);
        btnCall = findViewById(R.id.btnCall);
        btnWeb = findViewById(R.id.btnWeb);
        etPhoneNumber = findViewById(R.id.etPhoneNumber);
        etMessage = findViewById(R.id.etMessage);

        // Explicit Intent to navigate to SecondActivity
        btnNavigate.setOnClickListener(view -> {
            String message = etMessage.getText().toString();
            if (message.isEmpty()) {
                Toast.makeText(this, "Enter a message", Toast.LENGTH_SHORT).show();
            } else {
                Intent intent = new Intent(MainActivity.this, SecondActivity.class);
                intent.putExtra("MESSAGE", message);
                startActivity(intent);
            }
        });

        // Implicit Intent to Call a Phone Number
        btnCall.setOnClickListener(view -> {
            String phoneNumber = etPhoneNumber.getText().toString();
            if (phoneNumber.isEmpty()) {
                Toast.makeText(this, "Enter a phone number", Toast.LENGTH_SHORT).show();
            } else {
                Intent callIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phoneNumber));
                startActivity(callIntent);
            }
        });

        // Implicit Intent to Open a Webpage
        btnWeb.setOnClickListener(view -> {
            Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com"));
            startActivity(webIntent);
        });
    }
}
```

---

#### **SecondActivity.java (Receiving Data)**
```java
package com.example.myapp;

import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class SecondActivity extends AppCompatActivity {
    TextView tvReceivedMessage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_second);

        tvReceivedMessage = findViewById(R.id.tvReceivedMessage);

        // Receiving data from Intent
        String message = getIntent().getStringExtra("MESSAGE");
        tvReceivedMessage.setText("Received: " + message);
    }
}
```

---

### **`activity_main.xml` (UI Layout)**
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <EditText
        android:id="@+id/etMessage"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Enter message" />

    <Button
        android:id="@+id/btnNavigate"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Go to Second Activity" />

    <EditText
        android:id="@+id/etPhoneNumber"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Enter phone number" />

    <Button
        android:id="@+id/btnCall"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Call Number" />

    <Button
        android:id="@+id/btnWeb"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Open Google" />

</LinearLayout>
```

---

### **Project Summary**
1. **Explicit Intent:** `MainActivity` → `SecondActivity`
2. **Implicit Intents:**  
   - Open Dialer (`ACTION_DIAL`)  
   - Open Web Browser (`ACTION_VIEW`)  
3. **Event Listeners (`setOnClickListener`)**  
4. **Error Handling:** Checks if fields are empty before performing actions.
