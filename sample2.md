

#### **1. What is an Activity?**  
An **Activity** in Android is the entry point for user interaction. Each screen in an Android app is represented by an activity. The lifecycle of an activity determines how it is created, paused, resumed, and destroyed by the system.

---

### **2. Activity Lifecycle Overview**  
Android manages an activity's state through the following lifecycle methods:

| **Method**     | **Description** |
|---------------|---------------|
| `onCreate()`   | Called when the activity is created for the first time. Used for initialization. |
| `onStart()`    | Called when the activity becomes visible to the user. |
| `onResume()`   | Called when the user can interact with the activity. |
| `onPause()`    | Called when another activity comes into the foreground. |
| `onStop()`     | Called when the activity is no longer visible. |
| `onDestroy()`  | Called before the activity is completely removed from memory. |
| `onRestart()`  | Called if the activity is restarted after being stopped. |

---

### **3. Steps to Implement `UserActivity.java` in Android Studio**  
#### **Step 1: Create `UserActivity.java`**
1. **Right-click on** `java/com.example.yourapp` → **New → Activity → Empty Activity**  
2. **Name it `UserActivity.java`**  
3. **Click Finish**

#### **Step 2: Modify `UserActivity.java` to Log Lifecycle Events**
```java
package com.example.myapp;

import android.os.Bundle;
import android.util.Log;
import androidx.appcompat.app.AppCompatActivity;

public class UserActivity extends AppCompatActivity {

    private static final String TAG = "ActivityLifecycle";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_user);
        Log.d(TAG, "onCreate() called - Activity Created");
    }

    @Override
    protected void onStart() {
        super.onStart();
        Log.d(TAG, "onStart() called - Activity Visible");
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.d(TAG, "onResume() called - Activity Interactive");
    }

    @Override
    protected void onPause() {
        super.onPause();
        Log.d(TAG, "onPause() called - Activity Paused");
    }

    @Override
    protected void onStop() {
        super.onStop();
        Log.d(TAG, "onStop() called - Activity Stopped");
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "onDestroy() called - Activity Destroyed");
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        Log.d(TAG, "onRestart() called - Activity Restarted");
    }
}
```

---

#### **Step 3: Create `activity_user.xml` Layout**
Navigate to `res > layout > activity_user.xml` and add this UI:

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <TextView
        android:id="@+id/lifecycleText"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Activity Lifecycle Example"
        android:textSize="18sp"
        android:textStyle="bold"
        android:gravity="center"
        android:padding="10dp"/>

    <Button
        android:id="@+id/btnFinish"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Close Activity" />
</LinearLayout>
```

---

#### **Step 4: Declare Activity in `AndroidManifest.xml`**
Navigate to `AndroidManifest.xml` and add:

```xml
<activity android:name=".UserActivity" />
```

---

#### **Step 5: Start `UserActivity` from `MainActivity`**
Modify `MainActivity.java` to include a button to navigate to `UserActivity`:

```java
package com.example.myapp;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Button btnStartActivity = findViewById(R.id.btnStartActivity);
        btnStartActivity.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(MainActivity.this, UserActivity.class);
                startActivity(intent);
            }
        });
    }
}
```

---

#### **Step 6: Run and Test**
1. **Run the app** and check `Logcat` for lifecycle logs.
2. **Press Home Button** → `onPause()` and `onStop()` should trigger.
3. **Reopen App from Recents** → `onRestart()`, `onStart()`, `onResume()` should trigger.
4. **Press Back Button** → `onPause()`, `onStop()`, `onDestroy()` should trigger.

---

### **4. Explanation of Lifecycle Behavior**
- **When the activity starts:**
  - `onCreate()` → `onStart()` → `onResume()`
- **When the app goes to the background (e.g., pressing Home):**
  - `onPause()` → `onStop()`
- **When the user reopens the app:**
  - `onRestart()` → `onStart()` → `onResume()`
- **When the app is closed (e.g., pressing Back):**
  - `onPause()` → `onStop()` → `onDestroy()`

---

### **5. Key Takeaways**
1. **`onCreate()`** → Initializes UI, called once when the activity starts.
2. **`onResume()`** → Activity is visible and interactive.
3. **`onPause()`** → Called when another activity comes to the foreground.
4. **`onDestroy()`** → Called when the activity is finished or destroyed.
5. **Lifecycle methods help manage app state efficiently (e.g., saving data on pause, releasing resources on stop).**

---
