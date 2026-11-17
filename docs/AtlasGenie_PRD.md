
# PRD - AtlasGenie
Team 2 - Duarte Abreu, João Milca, Tomás Bessa, Tomás Coias

## 1. Executive Summary & Overview

**Product / Company Name:** AtlasGenie

**Product Description:** AtlasGenie is a web application for travel planning that uses Artificial Intelligence to create personalized itineraries based on the user's destination, dates, budget, number of travelers, and interests. The application centralizes planning, activity organization, and expense listing, allowing the user to adapt the itinerary through a virtual assistant. The main objective is to make travel planning simpler so that less research is needed to find each piece of information.

**Target Audience (Customer Segments):** AtlasGenie is intended for people planning leisure trips, including solo travelers, couples, families, and small groups. It is especially useful for users who have little time to organize a trip, are looking for suggestions aligned with their interests, or want to bring itineraries, activities, and expenses together in one place.

---

## 2. Core Features

The main features planned for the application are:

- **AI-Powered Itinerary Generation:** The user enters the destination, dates, budget, number of travelers, and interests. Artificial Intelligence generates a proposed itinerary organized by day, with activities and suggestions suited to the indicated preferences.
- **Trip Management Dashboard:** A private area where the user can view saved trips, keep track of upcoming plans, and view information relevant to a specific trip.
- **Editable Daily Itinerary:** The user can view each day's plan and adjust, add, or remove activities to adapt the trip to their needs.
- **Budget Planning and Expense Tracking:** The application allows users to set a budget and track estimates or trip expenses.
- **Conversational AI Assistant:** The virtual assistant allows users to ask questions about the plan and request changes to the trip, such as modifying planned activities, finding more affordable alternatives, or adapting the itinerary's pace.
- **User Registration and Authentication:** Users can create an account, sign in, and access their saved trips in a private area.
- **Automated Notifications and Reminders:** The system can send confirmation emails and trip-related reminders, such as when the departure date is approaching.
- **Landing Page and Product Onboarding:** A public page presents the value proposition and main features, and directs visitors to register or sign in.

---

## 3. Implementation Approach & Challenges

**High-Level Implementation:** The application is designed with a web architecture consisting of a frontend, backend, and database. The frontend provides the landing page, trip creation forms, dashboard, and itinerary views. The backend manages authentication, business logic, data access, and requests to Artificial Intelligence services. The database stores user accounts, trips, itineraries, and budget data. An AI service generates itinerary proposals and supports conversational interaction. An automation system handles notifications and reminders. The architecture must ensure that each user can only access their own data and that API keys are kept on the server.

**Challenges & Solutions:** The main challenges anticipated during development include:

- **Challenge 1: Creating personalized and coherent itineraries**
  - **Solution:** Collect the user's essential preferences and provide this information to the AI model through structured instructions. The application should allow the result to be edited and validate relevant data before presenting it as confirmed.
- **Challenge 2: Staying within the budget and avoiding misleading information**
  - **Solution:** Present costs as estimates when they have not been verified, distinguish AI-generated suggestions from confirmed information, and allow the user to adjust the budget and activities.
- **Challenge 3: Protecting accounts and personal data**
  - **Solution:** Implement secure authentication, backend access control, and database authorization rules to ensure that each user can only view and modify their own data.
- **Challenge 4: Coordinating AI features and automations**
  - **Solution:** Separate itinerary generation, assistant conversations, and notification delivery into their own components, with error handling and clear messages for the user.

---

## 4. Development Artifacts & Resources

**Initial Requirements / Prompts:** Develop a web-based SaaS application called AtlasGenie to help users plan trips in a personalized way using Artificial Intelligence. The application should include a public landing page, user registration and authentication, a private dashboard, trip creation and management, day-by-day itinerary generation, activity editing, budget management, and a conversational AI assistant. It should also include a database to store trips and user data, as well as at least one useful automation, such as sending emails or reminders before departure. The solution must have a frontend, backend, and database, and protect each user's data.

**Public Landing Page:**

**Source Code / Repository:**

---

## 5. Product FAQs

- **Q: What is AtlasGenie?**
  - A: AtlasGenie is a travel-planning application that uses Artificial Intelligence to help create, organize, and adapt itineraries according to the user's preferences and budget.

- **Q: How can I create a trip?**
  - A: After creating an account and signing in, the user can access the trip creation area and enter the destination, dates, number of travelers, budget, and interests. The application uses this information to generate an itinerary proposal.

- **Q: Can I customize the generated itinerary?**
  - A: Yes. Initially, the user will use AI to create and generate the “trip,” so to speak, but afterwards the user can adjust the plan and ask the AI assistant to suggest alternatives or adapt activities.

- **Q: Does AtlasGenie help control costs?**
  - A: Yes. The application is designed to allow users to set a budget and track estimates or expenses.

- **Q: Are my trips saved?**
  - A: The application will save trips in the dashboard linked to the user's account so that they can be viewed and updated later, if necessary.

- **Q: Does AtlasGenie book flights, hotels, or activities?**
  - A: This is not part of the functional scope described in this version. The focus will be solely on trip planning and organization, as booking would require a specific integration with providers.

- **Q: How do emails and reminders work?**
  - A: The automations can send confirmation emails and reminders before departure, provided these “features” are configured and enabled by the user.

- **Q: What should I do if an AI suggestion seems incorrect?**
  - A: The user should verify important information, such as opening hours, prices, availability, and access conditions. The application should flag information that has not been fully confirmed so that the user can treat it with caution.

- **Q: How can I get help?**
  - A: The user can turn to the virtual assistant or to the support channels that may be configured for the application.

---

## 6. Contact & Scheduling Channels

**Scheduling / Booking Link (if implemented):** To be defined
**Support Contact:**  Support contact to be defined
