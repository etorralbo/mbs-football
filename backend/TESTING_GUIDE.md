# Exercise API Testing Guide

## Overview
This guide explains how to test the secure Exercise CRUD API with Supabase JWT authentication.

## Prerequisites

### 1. Environment Variables
Add these variables to your `backend/.env` file:

```env
# Existing variables
DATABASE_URL=postgresql://...
ENV=local

# New Supabase variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_AUD=authenticated
# Optional (auto-derived from SUPABASE_URL if not set):
# SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1
# SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
```

### 2. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Database Setup
Ensure your database has the required tables and a user profile:

```sql
-- Example: Create a test user profile
-- First, get a Supabase user ID from your Supabase Auth dashboard
INSERT INTO user_profiles (id, supabase_user_id, team_id, role, name, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'YOUR_SUPABASE_USER_ID'::uuid,  -- Replace with actual Supabase user ID
    (SELECT id FROM teams LIMIT 1),  -- Use existing team or create one
    'COACH',
    'Test Coach',
    NOW(),
    NOW()
);
```

### 4. Get a JWT Token
Authenticate with Supabase to get a JWT token:

**Method 1: Using Supabase Dashboard**
- Go to your Supabase project
- Navigate to Authentication > Users
- Select a user and copy their JWT token

**Method 2: Using Supabase Client**
```javascript
// In your frontend or a test script
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'coach@example.com',
  password: 'your-password'
})
const token = data.session.access_token
```

**Method 3: Using curl**
```bash
curl -X POST 'https://your-project.supabase.co/auth/v1/token?grant_type=password' \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -d '{
    "email": "coach@example.com",
    "password": "your-password"
  }'
```

## API Endpoints

### Base URL
```
http://localhost:8000/v1
```

### Authentication
All endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Test Scenarios

### 1. Create Exercise (Coach Only)

**Request:**
```bash
curl -X POST http://localhost:8000/v1/exercises \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Squats",
    "description": "Standard bodyweight squats with proper form",
    "tags": "strength, legs, bodyweight"
  }'
```

**Expected Response (201 Created):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "team_id": "123e4567-e89b-12d3-a456-426614174001",
  "name": "Squats",
  "description": "Standard bodyweight squats with proper form",
  "tags": "strength, legs, bodyweight",
  "video_asset_id": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Error Cases:**
- 401: Invalid/expired token
- 403: User is not a COACH or not onboarded
- 409: Exercise with same name already exists for this team

---

### 2. List Exercises (All Users)

**Request:**
```bash
curl -X GET http://localhost:8000/v1/exercises \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**With Search:**
```bash
curl -X GET "http://localhost:8000/v1/exercises?search=squat" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200 OK):**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "team_id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "Squats",
    "description": "Standard bodyweight squats with proper form",
    "tags": "strength, legs, bodyweight",
    "video_asset_id": null,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

**Security Note:** Only returns exercises belonging to the user's team (team-scoped).

---

### 3. Get Single Exercise (All Users)

**Request:**
```bash
curl -X GET http://localhost:8000/v1/exercises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "team_id": "123e4567-e89b-12d3-a456-426614174001",
  "name": "Squats",
  "description": "Standard bodyweight squats with proper form",
  "tags": "strength, legs, bodyweight",
  "video_asset_id": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Error Cases:**
- 404: Exercise not found or belongs to different team (IDOR prevention)

---

### 4. Update Exercise (Coach Only)

**Request:**
```bash
curl -X PATCH http://localhost:8000/v1/exercises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jump Squats",
    "description": "Explosive squat variation with jump",
    "tags": "strength, legs, plyometric"
  }'
```

**Partial Update (only name):**
```bash
curl -X PATCH http://localhost:8000/v1/exercises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Squats"
  }'
```

**Expected Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "team_id": "123e4567-e89b-12d3-a456-426614174001",
  "name": "Jump Squats",
  "description": "Explosive squat variation with jump",
  "tags": "strength, legs, plyometric",
  "video_asset_id": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z"
}
```

**Error Cases:**
- 403: User is not a COACH
- 404: Exercise not found or belongs to different team
- 409: Updated name conflicts with existing exercise

---

### 5. Delete Exercise (Coach Only)

**Request:**
```bash
curl -X DELETE http://localhost:8000/v1/exercises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (204 No Content):**
```
(Empty body)
```

**Error Cases:**
- 403: User is not a COACH
- 404: Exercise not found or belongs to different team

---

## Security Tests

### Test 1: IDOR Prevention
Try to access/modify an exercise from a different team:

```bash
# Get exercise ID from another team (if you have access to multiple teams)
curl -X GET http://localhost:8000/v1/exercises/OTHER_TEAM_EXERCISE_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected:** 404 Not Found (exercise not visible across teams)

---

### Test 2: Role-Based Access Control
Try to create exercise as an ATHLETE:

```bash
# Use a token for a user with ATHLETE role
curl -X POST http://localhost:8000/v1/exercises \
  -H "Authorization: Bearer ATHLETE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Exercise",
    "description": "Should fail"
  }'
```

**Expected:** 403 Forbidden (only COACH can create)

---

### Test 3: Invalid Token
Try without authentication:

```bash
curl -X GET http://localhost:8000/v1/exercises
```

**Expected:** 403 Forbidden (missing credentials)

---

### Test 4: Expired Token
Use an expired JWT token:

```bash
curl -X GET http://localhost:8000/v1/exercises \
  -H "Authorization: Bearer EXPIRED_TOKEN"
```

**Expected:** 401 Unauthorized (token expired)

---

### Test 5: User Not Onboarded
Use a valid Supabase token but user has no UserProfile:

```bash
curl -X GET http://localhost:8000/v1/exercises \
  -H "Authorization: Bearer VALID_BUT_NO_PROFILE_TOKEN"
```

**Expected:** 403 Forbidden ("User not onboarded. Please complete registration.")

---

## API Documentation

### Interactive Docs
Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Testing with Swagger UI
1. Click "Authorize" button
2. Enter: `Bearer YOUR_JWT_TOKEN`
3. Click "Authorize"
4. Test endpoints directly from the UI

---

## Troubleshooting

### "Failed to fetch JWKS"
- Verify `SUPABASE_URL` is correct
- Check network connectivity to Supabase
- Ensure JWKS endpoint is accessible: `curl https://your-project.supabase.co/auth/v1/.well-known/jwks.json`

### "Invalid token issuer"
- Verify `SUPABASE_JWT_ISSUER` matches your Supabase project
- Default should be: `https://your-project.supabase.co/auth/v1`

### "User not onboarded"
- Ensure user has a record in `user_profiles` table
- Verify `supabase_user_id` matches the `sub` claim in the JWT

### "Exercise not found" (but you know it exists)
- Check that exercise belongs to your user's team
- Verify `team_id` on the exercise matches your user's `team_id`

---

## Security Features Implemented

✅ **JWT Signature Verification**: Uses JWKS to verify token signatures
✅ **Claim Validation**: Validates `exp`, `iss`, `aud`, `sub` claims
✅ **JWKS Caching**: 10-minute TTL to reduce network overhead
✅ **No Unsigned Tokens**: Only RS256 algorithm accepted
✅ **Team Isolation**: All queries filtered by team_id (IDOR prevention)
✅ **Role-Based Access Control**: COACH-only write operations
✅ **Strict Authorization**: No trusting client-provided team_id
✅ **Proper Error Handling**: Detailed error messages without leaking sensitive data

---

## Next Steps

1. Add integration tests
2. Implement rate limiting
3. Add audit logging
4. Implement soft delete (if needed)
5. Add media asset upload for video_asset_id
