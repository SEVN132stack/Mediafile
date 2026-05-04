<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function status()
    {
        return response()->json(['has_users' => User::count() > 0]);
    }

    public function setup(Request $request)
    {
        if (User::count() > 0) abort(400, 'Setup al voltooid');

        $data = $request->validate([
            'username'     => 'required|string|max:50',
            'password'     => 'required|string|min:4',
            'display_name' => 'nullable|string|max:100',
        ]);

        $user = User::create([
            'username'     => $data['username'],
            'password'     => Hash::make($data['password']),
            'display_name' => $data['display_name'] ?? $data['username'],
            'role'         => 'admin',
        ]);

        return response()->json([
            'token' => $user->createToken('app')->plainTextToken,
            'user'  => $user->only('id', 'username', 'display_name', 'role'),
        ], 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::whereRaw('LOWER(username) = ?', [strtolower($data['username'])])->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['username' => 'Ongeldige gegevens']);
        }

        $user->tokens()->delete();

        return response()->json([
            'token' => $user->createToken('app')->plainTextToken,
            'user'  => $user->only('id', 'username', 'display_name', 'role'),
        ]);
    }

    public function me(Request $request)
    {
        return response()->json($request->user()->only('id', 'username', 'display_name', 'role'));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['success' => true]);
    }
}
