import { useEffect, useMemo, useState } from "react";
import "./App.css";

import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
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
const DEFAULT_ROOM = "123456";

function App() {
  const [user, setUser] = useState(null);
  const [firebaseReady, setFirebaseReady] = useState(false);

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

  // Firebase anonymous login
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setFirebaseReady(Boolean(currentUser));
    });

    signInAnonymously(auth).catch((error) => {
      console.error("Firebase login failed:", error);
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

    const roomRef = doc(db, "rooms", roomCode);

    const unsubscribe = onSnapshot(
      roomRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          if (Array.isArray(data.people) && data.people.length > 0) {
            setPeople(data.people);
          }
        } else {
          await setDoc(roomRef, {
            people: DEFAULT_PEOPLE,
            createdAt: new Date().toISOString(),
          });
        }
      },
      (error) => {
        console.error("Room listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, roomCode]);

  // Listen to expenses in realtime
  useEffect(() => {
    if (!user || !roomCode) return;

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
  }, [user, roomCode]);

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
      (total, expense) => total + Number(expense.amount || 0),
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
        result[expense.paidBy] += Number(expense.amount || 0);
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

    if (!/^\d{6}$/.test(cleanCode)) {
      alert("Room Code exactly 6 digits ka hona chahiye.");
      return;
    }

    setRoomCode(cleanCode);
    setSelectedMonth(
      new Date().toISOString().slice(0, 7)
    );
  }

  // Add person
  async function addPerson() {
    if (people.length >= 3) {
      alert("Maximum 3 people allowed.");
      return;
    }

    const updatedPeople = [...people, ""];

    setPeople(updatedPeople);

    if (user) {
      await setDoc(
        doc(db, "rooms", roomCode),
        {
          people: updatedPeople,
        },
        { merge: true }
      );
    }
  }

  // Remove third person
  async function removePerson(index) {
    if (index < 2) return;

    const updatedPeople = people.filter(
      (_, personIndex) => personIndex !== index
    );

    setPeople(updatedPeople);

    if (user) {
      await setDoc(
        doc(db, "rooms", roomCode),
        {
          people: updatedPeople,
        },
        { merge: true }
      );
    }
  }

  // Update person
  async function updatePerson(index, value) {
    const updatedPeople = [...people];
    updatedPeople[index] = value;

    setPeople(updatedPeople);

    if (user) {
      await setDoc(
        doc(db, "rooms", roomCode),
        {
          people: updatedPeople,
        },
        { merge: true }
      );
    }
  }

  // Add / update expense
  async function saveExpense(e) {
    e.preventDefault();

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      alert("Valid amount enter karo.");
      return;
    }

    if (!description.trim()) {
      alert("Kis cheez ka payment hai wo enter karo.");
      return;
    }

    if (!activePeople[paidBy]) {
      alert("Payment karne wala person select karo.");
      return;
    }

    if (!date) {
      alert("Date select karo.");
      return;
    }

    if (!user) {
      alert("Firebase connection ready nahi hai.");
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
          }
        );
      }

      setAmount("");
      setDescription("");
      setEditingId(null);
      setSelectedMonth(date.slice(0, 7));
    } catch (error) {
      console.error("Expense save error:", error);
      alert("Payment save nahi ho paya.");
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
    setPaidBy(personIndex >= 0 ? personIndex : 0);

    setSelectedMonth(expense.date.slice(0, 7));

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
      console.error("Delete error:", error);
      alert("Payment delete nahi ho paya.");
    }
  }

  // Format date
  function formatDate(dateString) {
    const dateObject = new Date(
      `${dateString}T00:00:00`
    );

    return dateObject.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Format month
  function formatMonth(monthString) {
    const dateObject = new Date(
      `${monthString}-01T00:00:00`
    );

    return dateObject.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
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
      const creditor = creditors[creditorIndex];

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

  return (
    <div className="app">

      <header className="header">
        <div>
          <h1>Daily Split</h1>
          <p>
            Daily payments record karo,
            month-end par automatic hisaab.
          </p>
        </div>

        <div className="total-box">
          <span>Monthly Total</span>
          <strong>
            ₹{totalExpense.toFixed(2)}
          </strong>
        </div>
      </header>

      {/* ROOM */}

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Shared Room</h2>
            <p className="hint">
              Same Room Code dono phones mein use karo.
            </p>
          </div>

          <span className="count">
            {firebaseReady ? "● Online" : "Connecting..."}
          </span>
        </div>

        <form onSubmit={joinRoom}>
          <div className="form-grid">
            <div>
              <label>Room Code</label>

              <input
                type="text"
                inputMode="numeric"
                maxLength="6"
                placeholder="123456"
                value={roomInput}
                onChange={(e) =>
                  setRoomInput(
                    e.target.value.replace(/\D/g, "")
                  )
                }
              />
            </div>

            <div>
              <label>Current Room</label>

              <div className="month-summary">
                <span>Connected Room</span>
                <strong>{roomCode}</strong>
              </div>
            </div>
          </div>

          <button className="add-button" type="submit">
            Join / Switch Room
          </button>
        </form>
      </section>

      {/* PEOPLE */}

      <section className="card">
        <div className="section-title">
          <div>
            <h2>People</h2>
            <p className="hint">
              Default 2 people. Zarurat par 3rd add karo.
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
                placeholder={`Person ${index + 1}`}
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
                  setAmount(e.target.value)
                }
              />
            </div>

            <div>
              <label>Payment kis cheez ka?</label>

              <input
                type="text"
                placeholder="Grocery"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
              />
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label>Kisne pay kiya?</label>

              <select
                value={paidBy}
                onChange={(e) =>
                  setPaidBy(
                    Number(e.target.value)
                  )
                }
              >
                {activePeople.map(
                  (person, index) => (
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
                  setDate(e.target.value)
                }
              />
            </div>
          </div>

          <button className="add-button">
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
              onClick={cancelEdit}
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
              setSelectedMonth(e.target.value)
            }
          >
            {availableMonths.map((month) => (
              <option
                key={month}
                value={month}
              >
                {formatMonth(month)}
              </option>
            ))}
          </select>
        </div>

        <div className="month-summary">
          <span>{formatMonth(selectedMonth)}</span>

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
            {monthExpenses.length} payment
            {monthExpenses.length !== 1
              ? "s"
              : ""}
          </span>
        </div>

        {monthExpenses.length === 0 ? (
          <p className="empty">
            Is month me abhi koi payment nahi hai.
          </p>
        ) : (
          <div className="expense-list">
            {monthExpenses.map((expense) => (
              <div
                className="expense"
                key={expense.id}
              >
                <div className="expense-info">
                  <strong>
                    {expense.description}
                  </strong>

                  <p>
                    {formatDate(expense.date)}
                  </p>

                  <small>
                    Paid by{" "}
                    <b>{expense.paidBy}</b>
                  </small>
                </div>

                <div className="expense-right">
                  <strong>
                    ₹{Number(expense.amount).toFixed(2)}
                  </strong>

                  <button
                    type="button"
                    className="small-button"
                    onClick={() =>
                      editExpense(expense)
                    }
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() =>
                      deleteExpense(expense.id)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MONTH SUMMARY */}

      <section className="card">
        <h2>Month End Summary</h2>

        <div className="summary-box">
          <div className="summary-row">
            <span>Total Expense</span>
            <strong>
              ₹{totalExpense.toFixed(2)}
            </strong>
          </div>

          <div className="summary-row">
            <span>People</span>
            <strong>
              {activePeople.length}
            </strong>
          </div>

          <div className="summary-row">
            <span>Per Person Share</span>
            <strong>
              ₹{equalShare.toFixed(2)}
            </strong>
          </div>
        </div>

        <h3 className="sub-heading">
          Actual Payments
        </h3>

        <div className="balance-list">
          {activePeople.map((person) => {
            const paid =
              paidAmounts[person] || 0;

            const balance =
              balances[person] || 0;

            return (
              <div
                className="balance"
                key={person}
              >
                <div>
                  <strong>{person}</strong>

                  <small>
                    Paid ₹{paid.toFixed(2)}
                  </small>
                </div>

                <strong
                  className={
                    balance >= 0
                      ? "receive"
                      : "pay"
                  }
                >
                  {balance >= 0
                    ? `Lena ₹${balance.toFixed(2)}`
                    : `Dena ₹${Math.abs(
                        balance
                      ).toFixed(2)}`}
                </strong>
              </div>
            );
          })}
        </div>
      </section>

      {/* SETTLEMENT */}

      <section className="card settlement-card">
        <h2>Final Settlement</h2>

        {settlements.length === 0 ? (
          <div className="settled">
            <strong>
              ✓ Hisaab barabar hai
            </strong>

            <span>
              Is month kisi ko kisi ko paise
              dene ki zarurat nahi.
            </span>
          </div>
        ) : (
          <div className="settlement-list">
            {settlements.map(
              (settlement, index) => (
                <div
                  className="settlement"
                  key={index}
                >
                  <div>
                    <strong>
                      {settlement.from}
                    </strong>

                    <span> → </span>

                    <strong>
                      {settlement.to}
                    </strong>
                  </div>

                  <strong>
                    ₹
                    {settlement.amount.toFixed(2)}
                  </strong>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;