import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import { auth, db } from "./firebase";

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";

const DEFAULT_PEOPLE = ["Anshu", "Ankita"];
const DEFAULT_ROOM = "SPLEXP02";

function App() {
  const [user, setUser] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [firebaseReady, setFirebaseReady] = useState(false);
  const [roomExists, setRoomExists] = useState(false);
  const [roomError, setRoomError] = useState("");

  const [roomCode, setRoomCode] = useState(() => {
    return localStorage.getItem("dailySplitRoom") || DEFAULT_ROOM;
  });

  const [roomInput, setRoomInput] = useState(() => {
    return localStorage.getItem("dailySplitRoom") || DEFAULT_ROOM;
  });

  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [expenses, setExpenses] = useState([]);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paidBy, setPaidBy] = useState(0);

  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const [editingId, setEditingId] = useState(null);

  // Firebase authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser?.isAnonymous) {
        try {
          await signOut(auth);
        } catch (error) {
          console.error("Anonymous logout error:", error);
        }
  
        setUser(null);
        setFirebaseReady(false);
        return;
      }
  
      setUser(currentUser);
      setFirebaseReady(Boolean(currentUser));
    });
  
    return () => unsubscribe();
  }, []);

  // Save room locally
  useEffect(() => {
    localStorage.setItem("dailySplitRoom", roomCode);
  }, [roomCode]);

  // Listen to room data
  useEffect(() => {
    if (!user || !roomCode) return;

    setRoomError("");
    setRoomExists(false);

    const roomRef = doc(db, "rooms", roomCode);

    const unsubscribe = onSnapshot(
      roomRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          setRoomExists(true);

          if (
            Array.isArray(data.people) &&
            data.people.length > 0
          ) {
            setPeople(data.people);
          }
        } else {
          setRoomExists(false);
          setPeople(DEFAULT_PEOPLE);
          setExpenses([]);
          setRoomError(
            "Ye room abhi Firebase me exist nahi karta."
          );
        }
      },
      (error) => {
        console.error("Room listener error:", error);
        setRoomExists(false);
        setRoomError(
          "Room access nahi mil raha. Firebase permissions check karo."
        );
      }
    );

    return () => unsubscribe();
  }, [user, roomCode]);

  // Listen to expenses in realtime
  useEffect(() => {
    if (!user || !roomCode || !roomExists) return;

    const expensesRef = collection(
      db,
      "rooms",
      roomCode,
      "expenses"
    );

    const expensesQuery = query(
      expensesRef,
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      expensesQuery,
      (snapshot) => {
        const firebaseExpenses = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setExpenses(firebaseExpenses);
      },
      (error) => {
        console.error("Expense listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, roomCode, roomExists]);

  // Authentication
  async function handleAuth(e) {
    e.preventDefault();

    setAuthError("");

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setAuthError("Email aur password dono enter karo.");
      return;
    }

    if (password.length < 6) {
      setAuthError(
        "Password kam se kam 6 characters ka hona chahiye."
      );
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
      } else {
        await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
      }

      setEmail("");
      setPassword("");
      setAuthError("");
    } catch (error) {
      console.error("Authentication error:", error);

      if (error.code === "auth/email-already-in-use") {
        setAuthError("Ye email already registered hai.");
      } else if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/user-not-found"
      ) {
        setAuthError("Email ya password galat hai.");
      } else if (error.code === "auth/weak-password") {
        setAuthError(
          "Password kam se kam 6 characters ka hona chahiye."
        );
      } else if (error.code === "auth/invalid-email") {
        setAuthError("Valid email address enter karo.");
      } else {
        setAuthError(
          error.message || "Login/signup failed."
        );
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  // Active people
  const activePeople = people.filter(
    (person) => person.trim() !== ""
  );

  // Month expenses
  const monthExpenses = useMemo(() => {
    return expenses.filter((expense) =>
      expense.date?.startsWith(selectedMonth)
    );
  }, [expenses, selectedMonth]);

  // Total
  const totalExpense = useMemo(() => {
    return monthExpenses.reduce(
      (total, expense) =>
        total + Number(expense.amount || 0),
      0
    );
  }, [monthExpenses]);

  // Paid amounts
  const paidAmounts = useMemo(() => {
    const result = {};

    activePeople.forEach((person) => {
      result[person] = 0;
    });

    monthExpenses.forEach((expense) => {
      if (result[expense.paidBy] !== undefined) {
        result[expense.paidBy] += Number(
          expense.amount || 0
        );
      }
    });

    return result;
  }, [monthExpenses, activePeople]);

  // Equal share
  const equalShare =
    activePeople.length > 0
      ? totalExpense / activePeople.length
      : 0;

  // Balance
  const balances = useMemo(() => {
    const result = {};

    activePeople.forEach((person) => {
      result[person] =
        (paidAmounts[person] || 0) - equalShare;
    });

    return result;
  }, [activePeople, paidAmounts, equalShare]);

  // Available months
  const availableMonths = useMemo(() => {
    const months = expenses
      .map((expense) => expense.date?.slice(0, 7))
      .filter(Boolean);

    const uniqueMonths = [...new Set(months)];

    const currentMonth = new Date()
      .toISOString()
      .slice(0, 7);

    if (!uniqueMonths.includes(currentMonth)) {
      uniqueMonths.push(currentMonth);
    }

    return uniqueMonths.sort().reverse();
  }, [expenses]);

  // Change room
  function joinRoom(e) {
    e.preventDefault();

    const cleanCode = roomInput.trim();

    if (!/^[A-Za-z0-9]{6,12}$/.test(cleanCode)) {
      alert(
        "Room Code exactly 6-12 digits ka hona chahiye."
      );
      return;
    }

    setRoomCode(cleanCode);

    setSelectedMonth(
      new Date().toISOString().slice(0, 7)
    );
  }

  // Add person
  async function addPerson() {
    if (!roomExists) return;

    if (people.length >= 3) {
      alert("Maximum 3 people allowed.");
      return;
    }

    const updatedPeople = [...people, ""];

    setPeople(updatedPeople);

    if (user) {
      try {
        await setDoc(
          doc(db, "rooms", roomCode),
          {
            people: updatedPeople,
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Add person error:", error);
        alert("Person add nahi ho paya.");
      }
    }
  }

  // Remove third person
  async function removePerson(index) {
    if (!roomExists) return;

    if (index < 2) return;

    const updatedPeople = people.filter(
      (_, personIndex) => personIndex !== index
    );

    setPeople(updatedPeople);

    if (user) {
      try {
        await setDoc(
          doc(db, "rooms", roomCode),
          {
            people: updatedPeople,
          },
          { merge: true }
        );
      } catch (error) {
        console.error(
          "Remove person error:",
          error
        );
        alert("Person remove nahi ho paya.");
      }
    }
  }

  // Update person
  async function updatePerson(index, value) {
    if (!roomExists) return;

    const updatedPeople = [...people];
    updatedPeople[index] = value;

    setPeople(updatedPeople);

    if (user) {
      try {
        await setDoc(
          doc(db, "rooms", roomCode),
          {
            people: updatedPeople,
          },
          { merge: true }
        );
      } catch (error) {
        console.error(
          "Update person error:",
          error
        );
      }
    }
  }

  // Add / update expense
  async function saveExpense(e) {
    e.preventDefault();

    const numericAmount = Number(amount);

    if (!roomExists) {
      alert("Pehle valid room connect karo.");
      return;
    }

    if (!numericAmount || numericAmount <= 0) {
      alert("Valid amount enter karo.");
      return;
    }

    if (!description.trim()) {
      alert(
        "Kis cheez ka payment hai wo enter karo."
      );
      return;
    }

    if (!activePeople[paidBy]) {
      alert(
        "Payment karne wala person select karo."
      );
      return;
    }

    if (!date) {
      alert("Date select karo.");
      return;
    }

    if (!user) {
      alert(
        "Firebase connection ready nahi hai."
      );
      return;
    }

    try {
      if (editingId) {
        const expenseRef = doc(
          db,
          "rooms",
          roomCode,
          "expenses",
          editingId
        );

        await updateDoc(expenseRef, {
          amount: numericAmount,
          description: description.trim(),
          paidBy: activePeople[paidBy],
          date,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(
          collection(
            db,
            "rooms",
            roomCode,
            "expenses"
          ),
          {
            amount: numericAmount,
            description: description.trim(),
            paidBy: activePeople[paidBy],
            date,
            createdAt: new Date().toISOString(),
            createdBy: user.uid,
          }
        );
      }

      setAmount("");
      setDescription("");
      setEditingId(null);
      setPaidBy(0);
      setSelectedMonth(date.slice(0, 7));
    } catch (error) {
      console.error(
        "Expense save error:",
        error
      );
      alert(
        "Payment save nahi ho paya."
      );
    }
  }

  // Start editing
  function editExpense(expense) {
    const personIndex = activePeople.indexOf(
      expense.paidBy
    );

    setEditingId(expense.id);
    setAmount(String(expense.amount));
    setDescription(expense.description);
    setDate(expense.date);
    setPaidBy(
      personIndex >= 0 ? personIndex : 0
    );

    setSelectedMonth(
      expense.date.slice(0, 7)
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // Cancel edit
  function cancelEdit() {
    setEditingId(null);
    setAmount("");
    setDescription("");
    setPaidBy(0);
    setDate(
      new Date().toISOString().split("T")[0]
    );
  }

  // Delete expense
  async function deleteExpense(id) {
    const confirmDelete = window.confirm(
      "Kya aap ye expense delete karna chahte ho?"
    );

    if (!confirmDelete) return;

    try {
      await deleteDoc(
        doc(
          db,
          "rooms",
          roomCode,
          "expenses",
          id
        )
      );

      if (editingId === id) {
        cancelEdit();
      }
    } catch (error) {
      console.error(
        "Delete error:",
        error
      );
      alert(
        "Payment delete nahi ho paya."
      );
    }
  }

  // Format date
  function formatDate(dateString) {
    const dateObject = new Date(
      `${dateString}T00:00:00`
    );

    return dateObject.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  // Format month
  function formatMonth(monthString) {
    const dateObject = new Date(
      `${monthString}-01T00:00:00`
    );

    return dateObject.toLocaleDateString(
      "en-IN",
      {
        month: "long",
        year: "numeric",
      }
    );
  }

  // Direct settlements
  function getSettlements() {
    const creditors = [];
    const debtors = [];

    activePeople.forEach((person) => {
      const balance = balances[person] || 0;

      if (balance > 0.01) {
        creditors.push({
          person,
          amount: balance,
        });
      } else if (balance < -0.01) {
        debtors.push({
          person,
          amount: Math.abs(balance),
        });
      }
    });

    const settlements = [];

    let debtorIndex = 0;
    let creditorIndex = 0;

    while (
      debtorIndex < debtors.length &&
      creditorIndex < creditors.length
    ) {
      const debtor = debtors[debtorIndex];
      const creditor =
        creditors[creditorIndex];

      const amount = Math.min(
        debtor.amount,
        creditor.amount
      );

      if (amount > 0.01) {
        settlements.push({
          from: debtor.person,
          to: creditor.person,
          amount,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount <= 0.01) {
        debtorIndex++;
      }

      if (creditor.amount <= 0.01) {
        creditorIndex++;
      }
    }

    return settlements;
  }

  const settlements = getSettlements();

  // --------------------------------------------------
  // LOGIN / SIGNUP SCREEN
  // --------------------------------------------------

  if (!user) {
    return (
      <div className="app">
        <section
          className="card"
          style={{
            maxWidth: "500px",
            margin: "80px auto",
          }}
        >
          <div className="section-title">
            <div>
              <h1>Daily Split</h1>

              <p className="hint">
                Secure login required
              </p>
            </div>
          </div>

          <form onSubmit={handleAuth}>
            <div>
              <label>Email / Gmail</label>

              <input
                type="email"
                placeholder="your@gmail.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                autoComplete="email"
              />
            </div>

            <div style={{ marginTop: "15px" }}>
              <label>Password</label>

              <input
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                autoComplete={
                  authMode === "login"
                    ? "current-password"
                    : "new-password"
                }
              />
            </div>

            {authError && (
              <p
                style={{
                  marginTop: "12px",
                  color: "#d33",
                }}
              >
                {authError}
              </p>
            )}

            <button
              className="add-button"
              type="submit"
              disabled={authLoading}
              style={{ marginTop: "18px" }}
            >
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                ? "Login"
                : "Create Account"}
            </button>
          </form>

          <div
            style={{
              textAlign: "center",
              marginTop: "18px",
            }}
          >
            {authMode === "login" ? (
              <p>
                Account nahi hai?{" "}
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError("");
                  }}
                >
                  Create Account
                </button>
              </p>
            ) : (
              <p>
                Account already hai?{" "}
                <button
                  type="button"
                  className="small-button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                  }}
                >
                  Login
                </button>
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  // --------------------------------------------------
  // MAIN APP
  // --------------------------------------------------

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Daily Split</h1>

          <p>
            Daily payments record karo,
            month-end par automatic hisaab.
          </p>

          <small>
            Logged in: {user.email}
          </small>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "8px",
          }}
        >
          <div className="total-box">
            <span>Monthly Total</span>

            <strong>
              ₹{totalExpense.toFixed(2)}
            </strong>
          </div>

          <button
            type="button"
            className="small-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* ROOM */}

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Shared Room</h2>

            <p className="hint">
              Same Room Code dono phones mein
              use karo.
            </p>
          </div>

          <span className="count">
            {firebaseReady
              ? "● Online"
              : "Connecting..."}
          </span>
        </div>

        <form onSubmit={joinRoom}>
          <div className="form-grid">
            <div>
              <label>Room Code</label>

              <input
                type="text"
                inputMode="text"
                maxLength="12"
                placeholder="Enter room code"
                value={roomInput}
                onChange={(e) =>
                  setRoomInput(
                    e.target.value.replace(
                      /[^a-zA-Z0-9]/g,
                      ""
                    )
                  )
                }
              />
            </div>

            <div>
              <label>Current Room</label>

              <div className="month-summary">
                <span>
                  Connected Room
                </span>

                <strong>
                  {roomCode}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="add-button"
            type="submit"
          >
            Join / Switch Room
          </button>
        </form>

        {roomError && (
          <p
            style={{
              marginTop: "12px",
              color: "#d33",
            }}
          >
            {roomError}
          </p>
        )}
      </section>

      {!roomExists ? (
        <section className="card">
          <h2>Room Not Connected</h2>

          <p className="empty">
            Valid existing room code enter karo.
          </p>
        </section>
      ) : (
        <>
          {/* PEOPLE */}

          <section className="card">
            <div className="section-title">
              <div>
                <h2>People</h2>

                <p className="hint">
                  Default 2 people. Zarurat par
                  3rd add karo.
                </p>
              </div>

              {people.length < 3 && (
                <button
                  type="button"
                  className="small-button"
                  onClick={addPerson}
                >
                  + Add Person
                </button>
              )}
            </div>

            <div className="people-grid">
              {people.map((person, index) => (
                <div
                  className="person-input"
                  key={index}
                >
                  <input
                    value={person}
                    placeholder={`Person ${
                      index + 1
                    }`}
                    onChange={(e) =>
                      updatePerson(
                        index,
                        e.target.value
                      )
                    }
                  />

                  {index >= 2 && (
                    <button
                      type="button"
                      className="remove-person"
                      onClick={() =>
                        removePerson(index)
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ADD / EDIT PAYMENT */}

          <section className="card">
            <h2>
              {editingId
                ? "Edit Payment"
                : "Add Payment"}
            </h2>

            <form onSubmit={saveExpense}>
              <div className="form-grid">
                <div>
                  <label>Amount</label>

                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="500"
                    value={amount}
                    onChange={(e) =>
                      setAmount(
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label>
                    Payment kis cheez ka?
                  </label>

                  <input
                    type="text"
                    placeholder="Grocery"
                    value={description}
                    onChange={(e) =>
                      setDescription(
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div className="form-grid">
                <div>
                  <label>
                    Kisne pay kiya?
                  </label>

                  <select
                    value={paidBy}
                    onChange={(e) =>
                      setPaidBy(
                        Number(
                          e.target.value
                        )
                      )
                    }
                  >
                    {activePeople.map(
                      (
                        person,
                        index
                      ) => (
                        <option
                          key={person}
                          value={index}
                        >
                          {person}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label>Date</label>

                  <input
                    type="date"
                    value={date}
                    onChange={(e) =>
                      setDate(
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <button
                className="add-button"
                type="submit"
              >
                {editingId
                  ? "✓ Update Payment"
                  : "+ Add Payment"}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="small-button"
                  style={{
                    width: "100%",
                    marginTop: "10px",
                  }}
                  onClick={
                    cancelEdit
                  }
                >
                  Cancel Edit
                </button>
              )}
            </form>
          </section>

          {/* MONTH */}

          <section className="card month-card">
            <div>
              <label>Month</label>

              <select
                value={selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(
                    e.target.value
                  )
                }
              >
                {availableMonths.map(
                  (month) => (
                    <option
                      key={month}
                      value={month}
                    >
                      {formatMonth(
                        month
                      )}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="month-summary">
              <span>
                {formatMonth(
                  selectedMonth
                )}
              </span>

              <strong>
                ₹{totalExpense.toFixed(2)}
              </strong>
            </div>
          </section>

          {/* PAYMENTS */}

          <section className="card">
            <div className="section-title">
              <h2>Payments</h2>

              <span className="count">
                {monthExpenses.length}{" "}
                payment
                {monthExpenses.length !==
                1
                  ? "s"
                  : ""}
              </span>
            </div>

            {monthExpenses.length ===
            0 ? (
              <p className="empty">
                Is month me abhi koi
                payment nahi hai.
              </p>
            ) : (
              <div className="expense-list">
                {monthExpenses.map(
                  (expense) => (
                    <div
                      className="expense"
                      key={expense.id}
                    >
                      <div className="expense-info">
                        <strong>
                          {
                            expense.description
                          }
                        </strong>

                        <p>
                          {formatDate(
                            expense.date
                          )}
                        </p>

                        <small>
                          Paid by{" "}
                          <b>
                            {
                              expense.paidBy
                            }
                          </b>
                        </small>
                      </div>

                      <div className="expense-right">
                        <strong>
                          ₹
                          {Number(
                            expense.amount
                          ).toFixed(
                            2
                          )}
                        </strong>

                        <button
                          type="button"
                          className="small-button"
                          onClick={() =>
                            editExpense(
                              expense
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() =>
                            deleteExpense(
                              expense.id
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          {/* MONTH SUMMARY */}

          <section className="card">
            <h2>
              Month End Summary
            </h2>

            <div className="summary-box">
              <div className="summary-row">
                <span>
                  Total Expense
                </span>

                <strong>
                  ₹
                  {totalExpense.toFixed(
                    2
                  )}
                </strong>
              </div>

              <div className="summary-row">
                <span>People</span>

                <strong>
                  {
                    activePeople.length
                  }
                </strong>
              </div>

              <div className="summary-row">
                <span>
                  Per Person Share
                </span>

                <strong>
                  ₹
                  {equalShare.toFixed(
                    2
                  )}
                </strong>
              </div>
            </div>

            <h3 className="sub-heading">
              Actual Payments
            </h3>

            <div className="balance-list">
              {activePeople.map(
                (person) => {
                  const paid =
                    paidAmounts[
                      person
                    ] || 0;

                  const balance =
                    balances[
                      person
                    ] || 0;

                  return (
                    <div
                      className="balance"
                      key={person}
                    >
                      <div>
                        <strong>
                          {person}
                        </strong>

                        <small>
                          Paid ₹
                          {paid.toFixed(
                            2
                          )}
                        </small>
                      </div>

                      <strong
                        className={
                          balance >=
                          0
                            ? "receive"
                            : "pay"
                        }
                      >
                        {balance >=
                        0
                          ? `Lena ₹${balance.toFixed(
                              2
                            )}`
                          : `Dena ₹${Math.abs(
                              balance
                            ).toFixed(
                              2
                            )}`}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          </section>

          {/* SETTLEMENT */}

          <section className="card settlement-card">
            <h2>
              Final Settlement
            </h2>

            {settlements.length ===
            0 ? (
              <div className="settled">
                <strong>
                  ✓ Hisaab barabar hai
                </strong>

                <span>
                  Is month kisi ko
                  kisi ko paise dene
                  ki zarurat nahi.
                </span>
              </div>
            ) : (
              <div className="settlement-list">
                {settlements.map(
                  (
                    settlement,
                    index
                  ) => (
                    <div
                      className="settlement"
                      key={index}
                    >
                      <div>
                        <strong>
                          {
                            settlement.from
                          }
                        </strong>

                        <span>
                          {" "}
                          →{" "}
                        </span>

                        <strong>
                          {
                            settlement.to
                          }
                        </strong>
                      </div>

                      <strong>
                        ₹
                        {settlement.amount.toFixed(
                          2
                        )}
                      </strong>
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;